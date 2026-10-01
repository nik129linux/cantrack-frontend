import type { ReactNode } from "react";
import { CalendarIcon, ChartIcon, CompassIcon, InboxIcon, PawIcon, PersonIcon } from "./icons.js";

export type UserRole = "walker" | "owner";

/** The four screens per role (DESIGN.md "Screens per role"). The tab id is its
 *  label, which is what onNavigate receives. */
const TABS_BY_ROLE: Record<UserRole, readonly string[]> = {
  walker: ["Today", "Clients", "Requests", "Profile"],
  owner: ["Discover", "My dogs", "Activity", "Profile"],
};

function TabIcon({ label }: { label: string }): ReactNode {
  switch (label) {
    case "Today":
      return <CalendarIcon />;
    case "Clients":
    case "My dogs":
      return <PawIcon />;
    case "Requests":
      return <InboxIcon />;
    case "Discover":
      return <CompassIcon />;
    case "Activity":
      return <ChartIcon />;
    default:
      return <PersonIcon />;
  }
}

export type BottomNavProps = {
  role: UserRole;
  /** Id (= label) of the current tab; it carries aria-current="page". */
  active: string;
  onNavigate?: (tabId: string) => void;
};

/** Bottom tab bar, 4 tabs per role, mobile-first PWA navigation. */
export function BottomNav({ role, active, onNavigate }: BottomNavProps) {
  return (
    <nav className="ui-bottom-nav" aria-label="Main">
      {TABS_BY_ROLE[role].map((label) => (
        <button
          key={label}
          className="ui-bottom-nav__tab"
          type="button"
          aria-current={label === active ? "page" : undefined}
          {...(label === active ? { "data-active": "" } : {})}
          onClick={() => onNavigate?.(label)}
        >
          <TabIcon label={label} />
          {label}
        </button>
      ))}
    </nav>
  );
}
