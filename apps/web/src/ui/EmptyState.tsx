import type { HTMLAttributes } from "react";
import { Button } from "./Button.js";
import { PawIcon } from "./icons.js";

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * Friendly flat empty state (DESIGN.md: prefer a simple character/icon over a
 * literal photo placeholder). Title renders as a heading so it is announced.
 */
export function EmptyState({ title, message, actionLabel, onAction, ...rest }: EmptyStateProps) {
  return (
    <div className="ui-empty" {...rest}>
      <span className="ui-empty__icon" aria-hidden="true">
        <PawIcon />
      </span>
      <h2 className="ui-empty__title">{title}</h2>
      {message !== undefined && message !== "" ? (
        <p className="ui-empty__message">{message}</p>
      ) : null}
      {actionLabel !== undefined && actionLabel !== "" ? (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
