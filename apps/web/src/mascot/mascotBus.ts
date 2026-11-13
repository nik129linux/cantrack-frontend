/**
 * What the mascot should be doing, as a tiny store with no React in it: the
 * API layer reports every write it sends (lib/api.ts), App reports logout, and
 * GlobalDogLoader subscribes with useSyncExternalStore.
 *
 * The bus only records real work. Delays (don't show fast operations) and
 * how long a reaction stays on screen live in GlobalDogLoader.
 */

export type MascotActivity =
  | { kind: "idle" }
  | { kind: "working"; label: string; since: number }
  | { kind: "success"; label: string; at: number }
  | { kind: "error"; label: string; at: number }
  | { kind: "farewell"; label: string; since: number; done: boolean };

type Listener = () => void;

let state: MascotActivity = { kind: "idle" };
let pending = 0;
let lastLabel = "";
const listeners = new Set<Listener>();

function set(next: MascotActivity) {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActivity(): MascotActivity {
  return state;
}

/** Start one tracked operation; call the returned function once it settles. */
export function beginWork(label: string): (outcome: "success" | "error") => void {
  pending += 1;
  lastLabel = label;
  if (state.kind !== "farewell" && state.kind !== "working") {
    set({ kind: "working", label, since: Date.now() });
  }

  let settled = false;
  return (outcome) => {
    if (settled) {
      return;
    }
    settled = true;
    pending = Math.max(0, pending - 1);
    if (state.kind === "farewell") {
      return;
    }
    if (outcome === "error") {
      // One failure is enough to show it, even if other writes are in flight.
      set({ kind: "error", label: "No se pudo completar", at: Date.now() });
      return;
    }
    if (pending > 0) {
      set({ kind: "working", label: lastLabel, since: Date.now() });
      return;
    }
    set({ kind: "success", label: "¡Listo!", at: Date.now() });
  };
}

/** Track a promise the API layer does not see (e.g. a Supabase call). */
export function trackWork<T>(promise: Promise<T>, label = "Guardando…"): Promise<T> {
  const end = beginWork(label);
  promise.then(
    () => end("success"),
    () => end("error"),
  );
  return promise;
}

/** The dog says goodbye while the session is being closed. */
export function beginFarewell(label = "¡Hasta pronto!"): () => void {
  set({ kind: "farewell", label, since: Date.now(), done: false });
  return () => {
    if (state.kind === "farewell") {
      set({ ...state, done: true });
    }
  };
}

/** The overlay calls this once a reaction has been shown. */
export function settle() {
  set(pending > 0 ? { kind: "working", label: lastLabel, since: Date.now() } : { kind: "idle" });
}

/** Tests only: forget everything between cases. */
export function resetMascot() {
  pending = 0;
  lastLabel = "";
  state = { kind: "idle" };
}
