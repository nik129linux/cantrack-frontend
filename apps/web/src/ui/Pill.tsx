import type { ButtonHTMLAttributes } from "react";

export type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** The active pill of a filter row is filled; the rest stay quiet. */
  active?: boolean;
};

/**
 * Filter chip / segmented-switch option. Exposes its state as `aria-pressed`
 * (always rendered, "true"/"false") and `data-active` for the filled style.
 */
export function Pill({ active = false, type = "button", ...rest }: PillProps) {
  return (
    <button
      className="ui-pill"
      type={type}
      aria-pressed={active}
      {...(active ? { "data-active": "" } : {})}
      {...rest}
    />
  );
}
