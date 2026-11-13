import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../lib/apiError.js";
import { translateApiError } from "../lib/errors.js";
import { fetchAvailability, sendHeartbeat, setAvailability } from "../lib/marketplace.js";

/** Online means the app sent its position in the last 120 s: beat every 30 s. */
export const HEARTBEAT_MS = 30_000;
const SWITCH_COOLDOWN_MS = 10_000;

export type Point = { lat: number; lng: number };

export type WalkerPresence = {
  /** null until the server answered once (screens then hide online-only hints). */
  online: boolean | null;
  /** The last position the browser gave us, for maps. */
  position: Point | null;
  busy: boolean;
  cooldown: boolean;
  error: string | null;
  toggle: () => Promise<void>;
  /** Adopt the server's answer (Inicio reads it from /home). */
  sync: (online: boolean) => void;
};

export function currentPosition(): Promise<Point> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || navigator.geolocation === undefined) {
      reject(new Error("no geolocation"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15_000 },
    );
  });
}

const PresenceContext = createContext<WalkerPresence | null>(null);

/** Screens rendered alone (tests, previews) get a quiet "unknown" presence. */
const DETACHED: WalkerPresence = {
  online: null,
  position: null,
  busy: false,
  cooldown: false,
  error: null,
  toggle: async () => undefined,
  sync: () => undefined,
};

export function useWalkerPresence(): WalkerPresence {
  return useContext(PresenceContext) ?? DETACHED;
}

/**
 * The walker's online switch for the whole app, not just Inicio: the 30 s
 * heartbeat keeps running on Solicitudes or Rutas, so the server never flips
 * the walker offline just because they left the home tab.
 */
export function WalkerPresenceProvider({
  walkerId,
  preview = false,
  children,
}: {
  walkerId: string;
  preview?: boolean;
  children: ReactNode;
}) {
  const [online, setOnline] = useState<boolean | null>(preview ? true : null);
  const [position, setPosition] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const refresh = useCallback(() => {
    if (preview || walkerId === "") {
      return;
    }
    try {
      void fetchAvailability(walkerId)
        .then((state) => setOnline(state.online))
        .catch(() => undefined);
    } catch {
      // An API client without this call (older mocks): Inicio still syncs from /home.
    }
  }, [preview, walkerId]);

  useEffect(() => {
    refresh();
    function onVisible() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // Heartbeat while the switch is on, on every walker screen.
  useEffect(() => {
    if (online !== true || preview) {
      return;
    }
    const id = window.setInterval(() => {
      void currentPosition()
        .then((point) => {
          setPosition(point);
          return sendHeartbeat(point.lat, point.lng);
        })
        .catch(() => undefined);
    }, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [online, preview]);

  const toggle = useCallback(async () => {
    setError(null);
    const next = onlineRef.current !== true;
    if (preview) {
      setOnline(next);
      return;
    }
    setBusy(true);
    try {
      if (next) {
        const point = await currentPosition().catch(() => null);
        if (point === null) {
          setError("Activa la ubicación del navegador para conectarte.");
          return;
        }
        setPosition(point);
        await setAvailability(walkerId, true, point);
      } else {
        await setAvailability(walkerId, false);
      }
      setOnline(next);
    } catch (failure: unknown) {
      if (failure instanceof ApiError && failure.status === 429) {
        setError("Espera un momento");
        setCooldown(true);
        window.setTimeout(() => setCooldown(false), SWITCH_COOLDOWN_MS);
      } else {
        setError(translateApiError(failure, "No pudimos cambiar tu estado."));
      }
    } finally {
      setBusy(false);
    }
  }, [preview, walkerId]);

  const sync = useCallback((value: boolean) => setOnline(value), []);

  const value = useMemo<WalkerPresence>(
    () => ({ online, position, busy, cooldown, error, toggle, sync }),
    [online, position, busy, cooldown, error, toggle, sync],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
