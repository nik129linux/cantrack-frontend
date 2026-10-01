/** Code-drawn kit icons (docs/design/IMAGE-PROMPTS.md: icons are SVG in code,
 *  never generated art). All are decorative: aria-hidden + focusable=false. */

export function PawIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <ellipse cx="19" cy="23" rx="7" ry="9" fill="currentColor" />
      <ellipse cx="32" cy="17" rx="7" ry="9" fill="currentColor" />
      <ellipse cx="45" cy="23" rx="7" ry="9" fill="currentColor" />
      <path
        d="M32 28c-9 0-17 8-17 16 0 6 5 10 11 10 3 0 4-2 6-2s3 2 6 2c6 0 11-4 11-10 0-8-8-16-17-16Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="5" />
      <path d="M32 19v14l10 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
    </svg>
  );
}

export function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 13l2.5-7A2 2 0 0 1 8.4 4.7h7.2a2 2 0 0 1 1.9 1.3L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5Zm2 0h3.2l1 2.2h3.6l1-2.2H18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CompassIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14.8 9.2l-1.6 4.4-4.4 1.6 1.6-4.4 4.4-1.6Z" fill="currentColor" />
    </svg>
  );
}

export function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 19V9m4.7 10V5m4.6 14v-6m4.7 6V8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.8 19.5a7.2 7.2 0 0 1 14.4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        d="M12 20.5S4 15.4 4 9.9A4.4 4.4 0 0 1 8.4 5.5c1.6 0 2.9.8 3.6 2 .7-1.2 2-2 3.6-2A4.4 4.4 0 0 1 20 9.9c0 5.5-8 10.6-8 10.6Z"
        fill="currentColor"
      />
    </svg>
  );
}
