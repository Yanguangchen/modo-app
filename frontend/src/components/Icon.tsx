const paths = {
  today: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  clarify: 'M4 6h16M4 12h10M4 18h7M17 15l2 2 3-4',
  meetings: 'M8 3v3M16 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h3M8 16h6',
  guide: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  knowledge: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h13M9 7h6',
  settings: 'M10 2h4l.5 2.5L16 5l2.2-1.2 2 2L19 8l.5 1.5L22 10v4l-2.5.5L19 16l1.2 2.2-2 2L16 19l-1.5.5L14 22h-4l-.5-2.5L8 19l-2.2 1.2-2-2L5 16l-.5-1.5L2 14v-4l2.5-.5L5 8 3.8 5.8l2-2L8 5l1.5-.5L10 2zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  plus: 'M12 5v14M5 12h14',
  play: 'M7 5l12 7-12 7V5z',
  pause: 'M8 5v14M16 5v14',
  check: 'M5 12l5 5 9-10',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  calendar: 'M8 3v3M16 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  question: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  close: 'M6 6l12 12M18 6L6 18',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  inbox: 'M4 13l3-8h10l3 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  coffee: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3',
  hourglass: 'M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9',
  task: 'M4 4h16v16H4zM8 12l3 3 5-6',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  columns: 'M4 4h4v16H4zM10 4h4v16h-4zM16 4h4v16h-4z',
  volume: 'M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07',
  volumeMute: 'M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6',
  skip: 'M6 5l9 7-9 7V5zM18 5v14',
  reschedule: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2',
  focus: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4',
  mindmap: 'M14 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM7 6a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM21 6a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM7 18a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM21 18a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM6.6 7.3l3.6 3.3M17.4 7.3l-3.6 3.3M6.6 16.7l3.6-3.3M17.4 16.7l-3.6-3.3',
  message: 'M4 5h16v11H9l-5 4V5z',
  send: 'M12 19V5M6 11l6-6 6 6',
  building: 'M4 21V5l8-2v18M12 21h8V9l-8-2M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M3 21h18',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  cloud: 'M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18z',
  cloudOff: 'M3 3l18 18M8 18h9M20.6 15.6A4 4 0 0 0 17.5 10a6 6 0 0 0-8.2-4.5M6.1 9.2A4.5 4.5 0 0 0 7 18',
  kanban: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v6h-4z',
  timeline: 'M3 12h18M6 8v8M11 6v12M16 9v6M20 10v4',
  gantt: 'M4 5h9M7 10h11M5 15h6M10 20h10',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6M11 8v6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 20, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      style={{ flex: 'none' }}
    >
      <path d={paths[name]} />
    </svg>
  )
}
