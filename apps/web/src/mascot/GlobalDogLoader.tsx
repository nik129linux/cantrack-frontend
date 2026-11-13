import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getActivity, settle, subscribe, type MascotActivity } from "./mascotBus.js";
import { MascotSprite, preloadMascot, type MascotPose } from "./MascotSprite.js";

/** Writes faster than this finish without the dog ever showing up. */
export const SHOW_DELAY_MS = 450;
/** Once the capsule is up, it stays at least this long (no blink). */
const MIN_VISIBLE_MS = 600;
const SUCCESS_MS = 1300;
const ERROR_MS = 2600;
/** One full wave, so the goodbye reads as a goodbye. */
const FAREWELL_MIN_MS = 1100;
const CAPSULE_EXIT_MS = 240;
const FAREWELL_EXIT_MS = 420;

type View =
  | { mode: "hidden" }
  | { mode: "capsule"; pose: MascotPose; label: string; tone: "info" | "success" | "error"; leaving: boolean; shownAt: number }
  | { mode: "farewell"; label: string; leaving: boolean };

/**
 * The one global mascot. Mount it once at the app root: it listens to the
 * mascot bus and shows the dog in a glass capsule while a write is in flight
 * (walking), jumps when it succeeds, looks sad when it fails, and waves over
 * a frosted screen while the session closes. Nothing here waits on purpose:
 * the dog only appears for work that is really happening.
 */
export function GlobalDogLoader() {
  const activity = useSyncExternalStore(subscribe, getActivity, getActivity);
  const [view, setView] = useState<View>({ mode: "hidden" });
  const viewRef = useRef(view);
  viewRef.current = view;

  // The common poses load with the app; the rest once the browser is idle.
  useEffect(() => {
    preloadMascot(["run", "walk", "wait"]);
    const later = () => preloadMascot(["jump", "sad", "bye"]);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(later);
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(later, 1500);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => react(activity, setView, viewRef), [activity]);

  if (view.mode === "hidden") {
    return null;
  }

  if (view.mode === "farewell") {
    return (
      <div className="mascot-farewell" data-leaving={view.leaving} role="status" aria-live="polite">
        <span className="mascot-farewell__dog">
          <MascotSprite pose="bye" size={220} />
        </span>
        <p className="mascot-farewell__label">{view.label}</p>
      </div>
    );
  }

  return (
    <div
      className="mascot-capsule"
      data-tone={view.tone}
      data-leaving={view.leaving}
      role={view.tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <MascotSprite pose={view.pose} size={104} className="mascot-capsule__dog" />
      <span className="mascot-capsule__label">{view.label}</span>
    </div>
  );
}

type SetView = (update: View | ((current: View) => View)) => void;

/** Turn a bus state into what is on screen; returns the timers' cleanup. */
function react(
  activity: MascotActivity,
  setView: SetView,
  viewRef: { readonly current: View },
): (() => void) | undefined {
  const timers: number[] = [];
  const after = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms));
  const cleanup = () => timers.forEach((id) => window.clearTimeout(id));

  // Slide the capsule out, then tell the bus the reaction has been shown.
  const leaveCapsule = () => {
    setView((current) => (current.mode === "capsule" ? { ...current, leaving: true } : current));
    after(CAPSULE_EXIT_MS, () => {
      setView({ mode: "hidden" });
      settle();
    });
  };

  switch (activity.kind) {
    case "idle":
      setView((current) => (current.mode === "capsule" && !current.leaving ? { ...current, leaving: true } : current));
      after(CAPSULE_EXIT_MS, () => setView((current) => (current.mode === "farewell" ? current : { mode: "hidden" })));
      return cleanup;

    case "working": {
      const show = () =>
        setView((current) =>
          current.mode === "capsule" && !current.leaving
            ? { ...current, pose: "walk", label: activity.label, tone: "info" }
            : { mode: "capsule", pose: "walk", label: activity.label, tone: "info", leaving: false, shownAt: Date.now() },
        );
      const waited = Date.now() - activity.since;
      if (waited >= SHOW_DELAY_MS) {
        show();
      } else {
        after(SHOW_DELAY_MS - waited, show);
      }
      return cleanup;
    }

    case "success":
    case "error": {
      const isError = activity.kind === "error";
      const current = viewRef.current;
      const shownAt = current.mode === "capsule" ? current.shownAt : Date.now();
      // A capsule that just appeared stays up long enough not to blink.
      const hold = Math.max(isError ? ERROR_MS : SUCCESS_MS, MIN_VISIBLE_MS - (Date.now() - shownAt));
      setView({
        mode: "capsule",
        pose: isError ? "sad" : "jump",
        label: activity.label,
        tone: isError ? "error" : "success",
        leaving: false,
        shownAt,
      });
      after(hold, leaveCapsule);
      return cleanup;
    }

    case "farewell": {
      setView((current) =>
        current.mode === "farewell" ? { ...current, label: activity.label } : { mode: "farewell", label: activity.label, leaving: false },
      );
      if (activity.done) {
        const remaining = Math.max(0, FAREWELL_MIN_MS - (Date.now() - activity.since));
        after(remaining, () => {
          setView((current) => (current.mode === "farewell" ? { ...current, leaving: true } : current));
          after(FAREWELL_EXIT_MS, () => {
            setView({ mode: "hidden" });
            settle();
          });
        });
      }
      return cleanup;
    }
  }
}
