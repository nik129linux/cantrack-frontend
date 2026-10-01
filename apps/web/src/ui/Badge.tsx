export type BadgeStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "draft"
  | "sent";

export type BadgeProps = {
  /** Drives the color mapping (DESIGN.md: pending peach, declined coral,
   *  draft butter, …) through `data-status`. */
  status: BadgeStatus | string;
  /** Visible text; defaults to the raw status. The accessible text stays the
   *  raw lowercase status — capitalization is visual only (CSS). */
  label?: string;
};

/** Small status pill. */
export function Badge({ status, label }: BadgeProps) {
  return (
    <span className="ui-badge" data-status={status}>
      {label ?? status}
    </span>
  );
}
