import type { ReactNode } from "react";

/** Line icons for the home panel (same 1.8px stroke as the auth icons). */
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

export function HomeIcon() {
  return (
    <Line>
      <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8Z" />
    </Line>
  );
}

export function CompassIcon() {
  return (
    <Line>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </Line>
  );
}

export function ListIcon() {
  return (
    <Line>
      <path d="M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01" />
    </Line>
  );
}

export function PawLineIcon() {
  return (
    <Line>
      <circle cx="7" cy="10" r="1.8" />
      <circle cx="11" cy="6.5" r="1.8" />
      <circle cx="16" cy="7" r="1.8" />
      <circle cx="19" cy="11" r="1.6" />
      <path d="M12 12c-3 0-5.500 2.600-5.500 5 0 1.700 1.400 2.500 3 2.500 1 0 1.500-.600 2.500-.600s1.500.600 2.500.600c1.600 0 3-.800 3-2.500 0-2.400-2.500-5-5.500-5Z" />
    </Line>
  );
}

export function PersonIcon() {
  return (
    <Line>
      <circle cx="12" cy="8" r="3.600" />
      <path d="M5 20c.8-3.600 3.600-5.400 7-5.400s6.200 1.800 7 5.400" />
    </Line>
  );
}

export function SunIcon() {
  return (
    <Line>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M18.400 5.600 17 7M7 17l-1.400 1.400" />
    </Line>
  );
}

export function CloudIcon() {
  return (
    <Line>
      <path d="M7 18h9.500a3.500 3.500 0 0 0 .5-6.960A5 5 0 0 0 7.300 9.600 4.200 4.200 0 0 0 7 18Z" />
    </Line>
  );
}

export function MoonIcon() {
  return (
    <Line>
      <path d="M20 14.500A8 8 0 0 1 9.500 4 8 8 0 1 0 20 14.500Z" />
    </Line>
  );
}

export function PlusIcon() {
  return (
    <Line>
      <path d="M12 5v14M5 12h14" />
    </Line>
  );
}

export function MinusIcon() {
  return (
    <Line>
      <path d="M5 12h14" />
    </Line>
  );
}

export function CheckIcon() {
  return (
    <Line>
      <path d="m5 12.500 4.500 4.500L19 7.500" />
    </Line>
  );
}

export function CloseIcon() {
  return (
    <Line>
      <path d="M6 6l12 12M18 6 6 18" />
    </Line>
  );
}
