/**
 * High-quality synthesized Web Audio feedback engine.
 * Provides distinct tactile and auditory feedback without external audio assets:
 * - 'tick': crisp, mechanical tactile click for buttons and toggles
 * - 'tack': wooden / ceramic resonant tap for selection, segmented tabs, and radio pills
 * - 'beep': clean, soft high-pitch chime blip for start timers, prompt actions, and alerts
 * - 'boop': warm rounded bubble drop for modals, quick capture, and cancellations
 * - 'complete': uplifting harmonic chime for finishing tasks and actions
 */

export type AudioFeedback = 'tick' | 'tack' | 'beep' | 'boop' | 'complete' | 'alert'

let audioCtx: AudioContext | null = null
let isEnabled = true
let masterVolume = 0.7

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const CtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (CtxClass) {
      audioCtx = new CtxClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => { /* handled on user gesture */ })
  }
  return audioCtx
}

export function configureAudio(options: { enabled?: boolean; volume?: number }) {
  if (options.enabled !== undefined) isEnabled = options.enabled
  if (options.volume !== undefined) masterVolume = Math.max(0, Math.min(1, options.volume))
}

export function playAudio(type: AudioFeedback = 'tick') {
  if (!isEnabled || masterVolume <= 0) return

  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime

  switch (type) {
    case 'tick': {
      // Crisp, tactile micro-tap (mechanical switch feel)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(1400, now)
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.02)

      const vol = 0.16 * masterVolume
      gain.gain.setValueAtTime(vol, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.025)
      break
    }

    case 'tack': {
      // Deeper, wooden / ceramic select tap for tabs, radio pills, and dropdowns
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(540, now)
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.045)

      const vol = 0.22 * masterVolume
      gain.gain.setValueAtTime(vol, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.048)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.05)
      break
    }

    case 'beep': {
      // Clean, pleasant high chime blip (880 Hz / A5)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, now)
      osc.frequency.setValueAtTime(920, now + 0.015)

      const vol = 0.15 * masterVolume
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(vol, now + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.085)
      break
    }

    case 'boop': {
      // Warm rounded downward bubble pop (modal open, soft cancel, pop)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(360, now)
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.075)

      const vol = 0.24 * masterVolume
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(vol, now + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.085)
      break
    }

    case 'complete': {
      // Uplifting two-note harmonic chime (C5 -> G5)
      const note1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      note1.type = 'sine'
      note1.frequency.setValueAtTime(523.25, now) // C5
      const vol1 = 0.16 * masterVolume
      gain1.gain.setValueAtTime(0, now)
      gain1.gain.linearRampToValueAtTime(vol1, now + 0.006)
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)
      note1.connect(gain1)
      gain1.connect(ctx.destination)
      note1.start(now)
      note1.stop(now + 0.095)

      const note2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      note2.type = 'sine'
      const start2 = now + 0.05
      note2.frequency.setValueAtTime(783.99, start2) // G5
      const vol2 = 0.18 * masterVolume
      gain2.gain.setValueAtTime(0, start2)
      gain2.gain.linearRampToValueAtTime(vol2, start2 + 0.006)
      gain2.gain.exponentialRampToValueAtTime(0.0001, start2 + 0.15)
      note2.connect(gain2)
      gain2.connect(ctx.destination)
      note2.start(start2)
      note2.stop(start2 + 0.16)
      break
    }

    case 'alert': {
      // Soft double-pip for notifications or warnings
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(700, now)
      osc.frequency.setValueAtTime(840, now + 0.04)

      const vol = 0.18 * masterVolume
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(vol, now + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.095)
      break
    }
  }
}
