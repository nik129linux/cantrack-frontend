import type { HTMLAttributes } from "react";
import { Button } from "./Button.js";
import { PawIcon } from "./icons.js";

export type BannerProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  subtitle?: string;
  /** Label of the single pill action; omit for a text-only hero. */
  actionLabel?: string;
  onAction?: () => void;
  tint?: string;
};

/**
 * Hero banner card: tinted background, paw-print pattern at 12% opacity,
 * illustration cut-out on the right, one white pill button (DESIGN.md).
 */
export function Banner({ title, subtitle, actionLabel, onAction, tint = "sage", ...rest }: BannerProps) {
  return (
    <div className="ui-banner" data-tint={tint} {...rest}>
      <span className="ui-banner__pattern" aria-hidden="true" />
      <div className="ui-banner__copy">
        <h2 className="ui-banner__title">{title}</h2>
        {subtitle !== undefined && subtitle !== null && subtitle !== "" ? (
          <p className="ui-banner__subtitle">{subtitle}</p>
        ) : null}
        {actionLabel !== undefined && actionLabel !== "" ? (
          <span className="ui-banner__action">
            <Button variant="secondary" onClick={onAction}>
              {actionLabel}
            </Button>
          </span>
        ) : null}
      </div>
      <span className="ui-banner__art" aria-hidden="true">
        <PawIcon />
      </span>
    </div>
  );
}
