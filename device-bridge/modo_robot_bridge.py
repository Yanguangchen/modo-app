#!/usr/bin/env python3
"""Local Modo <-> XiaoZhi robot reminder bridge."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import socket
import subprocess
import threading
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import websockets


MODO_API_URL = os.getenv("MODO_API_URL", "http://127.0.0.1:3001").rstrip("/")
DEVICE_IP = os.getenv("XIAOZHI_DEVICE_IP", "10.38.219.148")
AUDIO_PORT = int(os.getenv("BRIDGE_AUDIO_PORT", "8765"))
POLL_SECONDS = int(os.getenv("BRIDGE_POLL_SECONDS", "8"))
AUDIO_DIR = Path(os.getenv("BRIDGE_AUDIO_DIR", Path(__file__).with_name("audio-cache")))
TTS_VOICE = os.getenv("BRIDGE_TTS_VOICE", "Samantha")


def local_ip() -> str:
    override = os.getenv("BRIDGE_HOST_IP")
    if override:
        return override
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect((DEVICE_IP, 8080))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def api_get(path: str) -> Any:
    with urllib.request.urlopen(f"{MODO_API_URL}{path}", timeout=6) as response:
        return json.loads(response.read().decode("utf-8"))


def create_audio(text: str, voice: str) -> tuple[Path, float]:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
    ogg_path = AUDIO_DIR / f"{digest}.ogg"
    if ogg_path.exists():
        return ogg_path, max(3.0, len(text) / 12.0)

    aiff_path = AUDIO_DIR / f"{digest}.aiff"
    say_command = ["say", "-o", str(aiff_path)]
    if voice:
        say_command[1:1] = ["-v", voice]
    say_command.append(text)
    subprocess.run(say_command, check=True, capture_output=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(aiff_path),
            "-ac",
            "1",
            "-c:a",
            "libopus",
            "-b:a",
            "24k",
            str(ogg_path),
        ],
        check=True,
        capture_output=True,
    )
    aiff_path.unlink(missing_ok=True)
    return ogg_path, max(3.0, len(text) / 12.0)


class QuietAudioHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        return


class ModoBridge:
    def __init__(self, style: str, voice: str) -> None:
        self.style = style
        self.voice = voice
        self.device_socket: Any | None = None
        self.send_lock = asyncio.Lock()
        self.audio_host = local_ip()
        self.fired: set[str] = set()

    def reminder_text(self, title: str, minutes_before: int) -> str:
        if self.style == "minimal":
            return f"{title}, {minutes_before} minutes." if minutes_before else f"Now: {title}."
        if self.style == "direct":
            return f"{title} starts in {minutes_before} minutes." if minutes_before else f"It is time for {title}."
        return (
            f"A gentle reminder: {title} starts in {minutes_before} minutes. Let's begin with one small step."
            if minutes_before
            else f"A gentle reminder: it is time for {title}. Let's begin with one small step."
        )

    async def send(self, message: dict[str, Any]) -> None:
        if self.device_socket is None:
            raise RuntimeError("robot websocket is not connected")
        async with self.send_lock:
            await self.device_socket.send(json.dumps(message, ensure_ascii=False))

    async def notify(self, text: str) -> bool:
        if self.device_socket is None:
            print("[modo-bridge] Robot chưa kết nối WebSocket")
            return False
        self.audio_host = local_ip()
        audio_path, estimated_seconds = await asyncio.to_thread(create_audio, text, self.voice)
        audio_url = f"http://{self.audio_host}:{AUDIO_PORT}/{urllib.parse.quote(audio_path.name)}"
        try:
            await self.send({
                "type": "notify",
                "audio_url": audio_url,
                "subtitles": [{"start_ms": 0, "text": text}],
            })
            print(f"[modo-bridge] Đã gửi robot đọc: {text}")
        except (OSError, websockets.WebSocketException, RuntimeError) as error:
            print(f"[modo-bridge] Không gửi được robot: {error}")
            return False
        await asyncio.sleep(estimated_seconds + 0.8)
        if self.device_socket is not None:
            try:
                await self.send({"type": "listen"})
            except (OSError, websockets.WebSocketException, RuntimeError):
                return False
        return True

    async def poll_reminders(self) -> None:
        while True:
            try:
                today = date.today().isoformat()
                data = await asyncio.to_thread(api_get, f"/robot/reminders?date={today}")
                now = datetime.now()
                self.fired = {marker for marker in self.fired if marker.startswith(f"{today}:")}
                for block in data.get("reminders", []):
                    start = block.get("start")
                    block_id = block.get("id")
                    if not start or not block_id:
                        continue
                    try:
                        start_at = datetime.strptime(f"{today} {start}", "%Y-%m-%d %H:%M")
                    except ValueError:
                        continue
                    for minutes in block.get("reminderMinutesBefore", [0]):
                        trigger_at = start_at - timedelta(minutes=int(minutes))
                        marker = f"{today}:{block_id}:{minutes}"
                        if marker in self.fired:
                            continue
                        if timedelta(seconds=-2) <= now - trigger_at <= timedelta(seconds=75):
                            title = block.get("title", "your next block")
                            if await self.notify(self.reminder_text(title, int(minutes))):
                                self.fired.add(marker)
                                break
            except Exception as error:
                print(f"[modo-bridge] Modo backend chưa sẵn sàng: {error}")
            await asyncio.sleep(POLL_SECONDS)

    async def receive_robot_events(self) -> None:
        uri = f"ws://{DEVICE_IP}:8080/ws"
        while True:
            try:
                print(f"[modo-bridge] Đang kết nối {uri}")
                async with websockets.connect(uri, ping_interval=20, open_timeout=8) as websocket:
                    self.device_socket = websocket
                    print("[modo-bridge] Đã kết nối robot")
                    async for raw_message in websocket:
                        try:
                            message = json.loads(raw_message)
                        except json.JSONDecodeError:
                            continue
                        if message.get("type") == "stt":
                            print(f"[modo-bridge] Robot nghe: {message.get('text', '')}")
            except Exception as error:
                print(f"[modo-bridge] Robot chưa kết nối: {error}")
            finally:
                self.device_socket = None
            await asyncio.sleep(3)

    async def run(self) -> None:
        AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        handler = lambda *args, **kwargs: QuietAudioHandler(*args, directory=str(AUDIO_DIR), **kwargs)
        server = ThreadingHTTPServer(("0.0.0.0", AUDIO_PORT), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        print(f"[modo-bridge] Audio server: http://{self.audio_host}:{AUDIO_PORT}/")
        await asyncio.gather(self.receive_robot_events(), self.poll_reminders())


def main() -> None:
    parser = argparse.ArgumentParser(description="Modo XiaoZhi robot bridge")
    parser.add_argument("--style", choices=["gentle", "direct", "minimal"], default=os.getenv("BRIDGE_REMINDER_STYLE", "gentle"))
    parser.add_argument("--voice", default=TTS_VOICE)
    args = parser.parse_args()
    try:
        asyncio.run(ModoBridge(args.style, args.voice).run())
    except KeyboardInterrupt:
        print("\n[modo-bridge] Đã dừng")


if __name__ == "__main__":
    main()
