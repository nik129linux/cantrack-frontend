import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
};

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Bottom modal sheet. Accessible by contract: the dialog is named by its title
 * (aria-labelledby) and marked aria-modal; focus moves inside on open, is
 * trapped while open (Tab from the last element wraps to the first, Shift+Tab
 * from the first wraps to the last), returns to the opener on close, and both
 * Escape and a backdrop click call onClose (clicks inside the sheet do not).
 * Renders nothing at all while closed.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<Element | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();

  // Open: remember the opener, move focus inside. Close/unmount: give focus back.
  useEffect(() => {
    if (!open) {
      return;
    }

    restoreFocusRef.current = document.activeElement;
    dialogRef.current?.focus();

    return () => {
      const opener = restoreFocusRef.current;
      if (opener instanceof HTMLElement) {
        opener.focus();
      }
    };
  }, [open]);

  // Escape closes from anywhere in the document while the sheet is open.
  useEffect(() => {
    if (!open) {
      return;
    }

    function onDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        closeRef.current();
      }
    }

    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }

    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => !element.hasAttribute("disabled"),
    );
    if (focusables.length === 0) {
      return;
    }

    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === dialog)) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="ui-sheet">
      <div
        className="ui-sheet__backdrop"
        data-backdrop=""
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className="ui-sheet__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <div className="ui-sheet__head">
          <h2 className="ui-sheet__title" id={titleId}>
            {title}
          </h2>
          <button className="ui-sheet__close" type="button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="ui-sheet__body">{children}</div>
      </div>
    </div>
  );
}
