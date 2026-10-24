import type { ReactNode } from "react";

/** Line icons for the auth forms (one 1.8px stroke) plus the two brand marks.
 *  All decorative: aria-hidden, the controls carry their own labels. */

function Line({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function MailIcon() {
  return (
    <Line>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7.5 8 6 8-6" />
    </Line>
  );
}

export function LockIcon() {
  return (
    <Line>
      <rect x="5" y="10.5" width="14" height="10" rx="3" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Line>
  );
}

export function UserIcon() {
  return (
    <Line>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4" />
    </Line>
  );
}

export function PhoneIcon() {
  return (
    <Line>
      <path d="M6.6 4h2.6l1.4 3.6-1.8 1.2a11 11 0 0 0 5.8 5.8l1.2-1.8L19.4 14v2.6A2.4 2.4 0 0 1 17 19 13 13 0 0 1 5 7a2.4 2.4 0 0 1 1.6-3Z" />
    </Line>
  );
}

export function EyeIcon() {
  return (
    <Line>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </Line>
  );
}

export function EyeOffIcon() {
  return (
    <Line>
      <path d="M10.2 5.7A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.8M6.6 7.3A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-1" />
      <path d="M9.9 9.9a2.8 2.8 0 0 0 4.2 3.7" />
      <path d="m4 4 16 16" />
    </Line>
  );
}

export function PinIcon() {
  return (
    <Line>
      <path d="M12 21s6.5-5.6 6.5-11A6.5 6.5 0 0 0 5.5 10C5.5 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10" r="2.4" />
    </Line>
  );
}

export function CameraIcon() {
  return (
    <Line>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-1.8h5.6L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </Line>
  );
}

export function ShieldIcon() {
  return (
    <Line>
      <path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.5 7 9 4.1-1.5 7-4.7 7-9V6l-7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.2 10" />
    </Line>
  );
}

export function ClockIcon() {
  return (
    <Line>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Line>
  );
}

export function RouteIcon() {
  return (
    <Line>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
    </Line>
  );
}

export function WalletIcon() {
  return (
    <Line>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5v-8Z" />
      <path d="M4 9h13M16 13.5h.01" />
    </Line>
  );
}

export function ArrowRightIcon() {
  return (
    <Line>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Line>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8Z"
      />
      <path
        fill="#34A853"
        d="M12 23c3 0 5.4-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1.1-3.7 1.1-2.8 0-5.2-1.9-6-4.5H2.4v2.8A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M6 14.2a6.6 6.6 0 0 1 0-4.2V7.2H2.4a11 11 0 0 0 0 9.8L6 14.2Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.4 7.2L6 10c.8-2.6 3.2-4.6 6-4.6Z"
      />
    </svg>
  );
}

export function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M16.4 12.6c0-2.5 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.2 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.8-1.1-2.8-4.1ZM13.9 5.2c.7-.9 1.2-2.1 1-3.3-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.2 1.2.1 2.4-.6 3.1-1.5Z" />
    </svg>
  );
}
