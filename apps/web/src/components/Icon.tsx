import { ReactNode } from "react";

export type IconName =
  | "logo" | "plus" | "home" | "book" | "note" | "settings" | "chevron"
  | "search" | "minus" | "fit" | "more" | "panel" | "play" | "pause"
  | "stop" | "previous" | "next" | "board" | "cc" | "repeat"
  | "simple" | "deeper" | "question" | "mic" | "send" | "sparkle"
  | "undo" | "trash" | "close" | "check" | "hint" | "expand" | "shield"
  | "upload" | "file" | "clock" | "headphones" | "sun" | "moon" | "mic-off" | "compress";

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    logo: <><path className="logo-p" d="M6 21V3h7l4 3v3l-4 3H6"/><path className="logo-l" d="M6 12v9h12"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22z"/><path d="M4 5.5v13A3.5 3.5 0 0 1 7.5 15H20"/></>,
    note: <><path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1H3v-4h1a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6V3h4v1a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .6 1h1v4h-1a1.7 1.7 0 0 0-.6 1z"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    minus: <path d="M5 12h14"/>,
    fit: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><path d="M8 12h8"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    panel: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></>,
    play: <path d="m8 5 11 7-11 7z"/>,
    pause: <><path d="M9 5v14M15 5v14"/></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2"/>,
    previous: <><path d="m15 18-6-6 6-6"/><path d="M5 5v14"/></>,
    next: <><path d="m9 18 6-6-6-6"/><path d="M19 5v14"/></>,
    board: <><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4M7 13l3-3 3 2 4-5"/></>,
    cc: <><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 10.5a2 2 0 1 0 0 3M16 10.5a2 2 0 1 0 0 3"/></>,
    repeat: <><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></>,
    simple: <><path d="M4 7h16M7 12h10M10 17h4"/></>,
    deeper: <><circle cx="12" cy="12" r="8"/><path d="M12 2v20M2 12h20"/><path d="M5.5 5.5c4 3.2 9 3.2 13 0M5.5 18.5c4-3.2 9-3.2 13 0"/></>,
    question: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01"/></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    "mic-off": <><path d="m3 3 18 18"/><path d="M9 5.3v5.7a3 3 0 0 0 5.1 2.1M15 9V6a3 3 0 0 0-5.1-2.1"/><path d="M5 11a7 7 0 0 0 12.2 4.7M12 18v3M9 21h6"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
    sparkle: <><path d="m12 3 1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z"/></>,
    undo: <><path d="m9 7-5 5 5 5"/><path d="M20 17a7 7 0 0 0-7-7H4"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    close: <><path d="M6 6l12 12M18 6 6 18"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    hint: <><path d="M9 18h6M10 22h4"/><path d="M8.5 14.5A6 6 0 1 1 15.5 14.5c-.9.7-1.4 1.5-1.5 2.5h-4c-.1-1-.6-1.8-1.5-2.5z"/></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></>,
    compress: <><path d="M3 9h6V3M21 9h-6V3M3 15h6v6M21 15h-6v6"/></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/></>,
    upload: <><path d="M12 16V3M7 8l5-5 5 5"/><path d="M5 14v6h14v-6"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h4v7H6a2 2 0 0 1-2-2zM20 14h-4v7h2a2 2 0 0 0 2-2z"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    moon: <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5a8.7 8.7 0 1 0 12 12z"/>,
  };
  return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function IconButton({ icon, label, onClick, active = false, className = "" }: { icon: IconName; label: string; onClick?: () => void; active?: boolean; className?: string }) {
  return <button type="button" className={`icon-button ${active ? "active" : ""} ${className}`} onClick={onClick} aria-label={label} title={label}><Icon name={icon} /></button>;
}

export function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return <button type="button" className={`icon-button mute-button ${muted ? "muted" : ""}`} onClick={onToggle} aria-pressed={muted} aria-label={muted ? "Unmute microphone" : "Mute microphone"} title={muted ? "Unmute microphone" : "Mute microphone"}><Icon name={muted ? "mic-off" : "mic"} /></button>;
}
