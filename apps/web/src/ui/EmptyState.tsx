import type { HTMLAttributes } from "react";
import type { Character } from "../art.js";
import { Button } from "./Button.js";
import { InteractiveMascot } from "./InteractiveMascot.js";
import { PawIcon } from "./icons.js";

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  character?: Character;
};

/**
 * Friendly empty state. Title renders as a heading so it is announced.
 */
export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  character,
  ...rest
}: EmptyStateProps) {
  return (
    <div className="ui-empty" {...rest}>
      {character !== undefined ? (
        <InteractiveMascot character={character} decorative size={120} className="ui-empty__mascot" />
      ) : (
        <span className="ui-empty__icon" aria-hidden="true">
          <PawIcon />
        </span>
      )}
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
