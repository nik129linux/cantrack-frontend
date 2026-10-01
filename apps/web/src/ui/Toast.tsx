import { useEffect } from "react";

export type ToastTone = "success" | "error" | "info";

export type ToastProps = {
  message: string;
  tone?: ToastTone;
  /**
   * When provided, a Dismiss button is rendered and non-error toasts
   * auto-dismiss after exactly 4000 ms (errors persist until dismissed —
   * DESIGN.md keeps the alert on screen). The host owns visibility.
   */
  onDismiss?: () => void;
};

const AUTO_DISMISS_MS = 4000;

/** Live-region toast: role="alert" for errors, role="status" otherwise. */
export function Toast({ message, tone = "info", onDismiss }: ToastProps) {
  useEffect(() => {
    if (tone === "error" || onDismiss === undefined) {
      return;
    }

    const timer = setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [tone, onDismiss]);

  return (
    <div className="ui-toast" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      <span className="ui-toast__message">{message}</span>
      {onDismiss !== undefined ? (
        <button className="ui-toast__dismiss" type="button" aria-label="Dismiss" onClick={onDismiss}>
          ✕
        </button>
      ) : null}
    </div>
  );
}
