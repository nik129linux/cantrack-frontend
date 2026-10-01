import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export type ListRowProps = Omit<HTMLAttributes<HTMLElement>, "title" | "onClick"> & {
  title: string;
  subtitle?: string;
  /** Small circular icon chip on the left (DESIGN.md list-row pattern). */
  icon?: ReactNode;
  /** Trailing content (a chevron is automatic for interactive rows). */
  trailing?: ReactNode;
  /** With a handler the whole row is a real <button>; without it, a plain
   *  row. Don't combine `trailing` buttons with `onClick` (nested
   *  interactive elements); give the row itself the handler instead. */
  onClick?: () => void;
};

function Chevron() {
  return (
    <svg
      className="ui-listrow__chevron"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M9 5l7 7-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * List row: round tinted icon chip on the left, title + muted subtitle stacked
 * next to it, chevron or trailing actions on the right. Interactive rows are
 * native buttons, so keyboard access and the accessible name (title +
 * subtitle) come for free. Callers may pass `data-*` attributes (e.g.
 * `data-tint`) which land on the root element and drive the kit palette.
 */
export function ListRow({ title, subtitle, icon, trailing, onClick, ...rest }: ListRowProps) {
  const content = (
    <>
      {icon !== undefined && icon !== null ? (
        <span className="ui-listrow__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="ui-listrow__copy">
        <span className="ui-listrow__title">{title}</span>
        {subtitle !== undefined && subtitle !== null && subtitle !== "" ? (
          <span className="ui-listrow__subtitle">{subtitle}</span>
        ) : null}
      </span>
    </>
  );

  if (onClick !== undefined) {
    return (
      <button
        type="button"
        className="ui-listrow"
        onClick={onClick}
        {...(rest as unknown as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {content}
        {trailing !== undefined && trailing !== null ? (
          <span className="ui-listrow__trailing">{trailing}</span>
        ) : (
          <Chevron />
        )}
      </button>
    );
  }

  return (
    <div className="ui-listrow" {...(rest as unknown as HTMLAttributes<HTMLDivElement>)}>
      {content}
      {trailing !== undefined && trailing !== null ? (
        <span className="ui-listrow__trailing">{trailing}</span>
      ) : null}
    </div>
  );
}
