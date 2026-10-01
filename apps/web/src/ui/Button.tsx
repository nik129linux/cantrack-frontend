import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * primary = brand green with INK text (white on --c-green is 2.2:1 and fails
   * WCAG), secondary = sage, ghost = quiet text button.
   */
  variant?: ButtonVariant;
};

/**
 * Kit button. Defaults to `type="button"` so dropping it inside a form never
 * submits by accident; forms pass `type="submit"` explicitly. The variant is
 * exposed via `data-variant` — the kit stylesheet keys every visual (and the
 * 44px tap target) off that attribute.
 */
export function Button({ variant = "primary", type = "button", ...rest }: ButtonProps) {
  return <button data-variant={variant} type={type} {...rest} />;
}
