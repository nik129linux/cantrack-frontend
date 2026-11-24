import { useEffect, useMemo, useRef, useState } from "react";
import { fetchWalkingRoute, markEnRoute, sendHeartbeat, type WalkingRoute } from "../lib/marketplace.js";
import { MarkersMap, type MapMarker } from "../map/MarkersMap.js";
import {
  bearingDeg,
  cardinal,
  formatDistance,
  haversineKm,
  lerpPoint,
  nearestIndex,
  pathKm,
  walkMinutes,
  type Point,
} from "../map/geo.js";
import { PhoneIcon, PinIcon } from "../auth/icons.js";
import "./walker-glass.css";
import "./walker-routes.css";

/** Closer than this and he is at the door. */
export const ARRIVED_KM = 0.05;
/** Walk this far from the last routed point and the streets are asked again. */
export const REFETCH_KM = 0.06;
/**
 * While he is on the way his position goes up this often (the API allows 4 a
 * minute, so 20 s leaves room for the online switch's own heartbeat).
 */
export const SHARE_EVERY_MS = 20_000;
/** How often the demo walker takes a step, in ms. */
const DEMO_STEP_MS = 1000;
export const STREET_RETRY_MS = 15_000;

export type NavTarget = {
  requestId: string;
  dogName: string | null;
  lat: number;
  lng: number;
  /** The address text the owner picked, when there is one. */
  label?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  /** When he tapped "Voy en camino" on this stop, else null. */
  enRouteAt?: string | null;
};

type Live = { point: Point | null; error: string | null };

/**
 * The walker's position while he walks to the pickup: the browser's watch, or,
 * in the dev preview, a dot that moves towards the pickup on its own.
 */
function useLivePosition(target: Point, from: Point | null, demo: boolean): Live {
  const [point, setPoint] = useState<Point | null>(demo ? from : null);
  const [error, setError] = useState<string | null>(null);
  const walked = useRef(0);

  useEffect(() => {
    if (demo) {
      const origin = from ?? { lat: target.lat - 0.008, lng: target.lng - 0.006 };
      walked.current = 0;
      setPoint(origin);
      const id = window.setInterval(() => {
        walked.current = Math.min(1, walked.current + 0.05);
        setPoint(lerpPoint(origin, target, walked.current));
      }, DEMO_STEP_MS);
      return () => window.clearInterval(id);
    }
    if (typeof navigator === "undefined" || navigator.geolocation === undefined) {
      setError("Activa la ubicación del navegador para guiarte hasta la recogida.");
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        setError(null);
        setPoint({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => setError("Activa la ubicación del navegador para guiarte hasta la recogida."),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
    // The target and origin of one trip never change while the panel is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  return { point, error };
}

/**
 * The streets from where he stands to the pickup. Asked once when the panel
 * opens and again only after he has walked away from the routed start, so a
 * position arriving every second never becomes a request every second.
 */
function useStreetRoute(walkerId: string, target: Point, point: Point | null, enabled: boolean) {
  const [route, setRoute] = useState<WalkingRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const routedFrom = useRef<Point | null>(null);
  const asking = useRef(false);
  const generation = useRef(0);
  const retryTimer = useRef<number | null>(null);

  // A new GPS fix must not invalidate an in-flight answer. Only a different
  // trip, arrival or unmount ends that request's lifetime.
  useEffect(() => {
    generation.current += 1;
    routedFrom.current = null;
    asking.current = false;
    setRoute(null);
    setLoading(false);
    return () => {
      generation.current += 1;
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    };
  }, [walkerId, target, enabled]);

  useEffect(() => {
    if (!enabled || point === null || asking.current || retryTimer.current !== null) {
      return;
    }
    const last = routedFrom.current;
    if (last !== null && haversineKm(last, point) < REFETCH_KM) {
      return;
    }
    const from = point;
    const requestGeneration = generation.current;
    asking.current = true;
    setLoading(true);
    let retry = false;
    fetchWalkingRoute(walkerId, from, target)
      .then((answer) => {
        if (generation.current === requestGeneration) {
          const streets = answer.source === "osrm" && answer.geometry.length > 1;
          if (streets) {
            setRoute(answer);
            routedFrom.current = from;
          } else {
            retry = true;
          }
        }
      })
      .catch(() => {
        retry = true;
      })
      .finally(() => {
        if (generation.current !== requestGeneration) return;
        asking.current = false;
        setLoading(false);
        if (retry) {
          retryTimer.current = window.setTimeout(() => {
            retryTimer.current = null;
            setAttempt((value) => value + 1);
          }, STREET_RETRY_MS);
        }
      });
  }, [walkerId, target, point, enabled, attempt]);

  return { route, loading };
}

/**
 * "Voy en camino": the owner may follow him from the tap on, so his position is
 * sent as soon as there is one and then every SHARE_EVERY_MS. Nothing is sent
 * before the tap (the position stays private until he decides).
 */
function useShareWhileEnRoute(point: Point | null, on: boolean): void {
  const lastSent = useRef(0);
  useEffect(() => {
    if (!on || point === null || Date.now() - lastSent.current < SHARE_EVERY_MS) {
      return;
    }
    lastSent.current = Date.now();
    // A failed beat is not worth interrupting him: the next one tries again.
    void sendHeartbeat(point.lat, point.lng).catch(() => undefined);
  }, [on, point]);
}

export type NavPanelProps = {
  walkerId: string;
  target: NavTarget;
  /** When he already tapped "Voy en camino" on this stop. */
  enRouteAt?: string | null;
  /** Called after a successful tap, so the route screen can refresh. */
  onEnRoute?: () => void;
  /** Where the server last saw him, used until the browser answers. */
  start?: { lat: number; lng: number } | null;
  demo?: boolean;
  busy?: boolean;
  /** Shown as the main button once he is there; omitted when he cannot start yet. */
  onStart?: () => void;
  onClose: () => void;
};

/**
 * Cómo llegar, inside the app: the pickup, his live position, the streets to
 * walk and the turn coming up. No other app opens.
 */
export function NavPanel({
  walkerId,
  target,
  enRouteAt = null,
  onEnRoute,
  start = null,
  demo = false,
  busy = false,
  onStart,
  onClose,
}: NavPanelProps) {
  const [shared, setShared] = useState(enRouteAt !== null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const destination = useMemo<Point>(() => ({ lat: target.lat, lng: target.lng }), [target.lat, target.lng]);
  const { point, error } = useLivePosition(destination, start, demo);
  const [follow, setFollow] = useState(true);
  const [centerKey, setCenterKey] = useState(0);

  useShareWhileEnRoute(point, shared && !demo);

  async function setOff() {
    setSharing(true);
    setShareError(null);
    try {
      if (!demo) {
        await markEnRoute(target.requestId);
      }
      setShared(true);
      onEnRoute?.();
    } catch {
      setShareError("No pudimos avisar al dueño. Intenta de nuevo.");
    } finally {
      setSharing(false);
    }
  }

  const direct = point === null ? null : haversineKm(point, destination);
  const arrived = direct !== null && direct <= ARRIVED_KM;
  const { route, loading: routeLoading } = useStreetRoute(walkerId, destination, point, !demo && !arrived);

  const path = useMemo<Point[]>(
    () => (route?.geometry ?? []).map(([lat, lng]) => ({ lat, lng })),
    [route],
  );

  // Where he is on the drawn way, which turn comes next and how far is left.
  const guide = useMemo(() => {
    if (route === null || path.length < 2 || point === null) {
      return null;
    }
    const index = nearestIndex(path, point);
    const remainingKm = haversineKm(point, path[index]!) + pathKm(path, index, path.length - 1);
    const currentStep = route.steps.filter((step) => step.startIndex <= index).length - 1;
    const next = route.steps[currentStep + 1] ?? null;
    const turnAt = next === null ? path.length - 1 : next.startIndex;
    const toTurnKm = haversineKm(point, path[index]!) + pathKm(path, index, turnAt);
    return {
      index,
      remainingKm,
      instruction: next?.text ?? "Sigue hasta el punto de recogida",
      toTurnKm,
      turnPoint: path[turnAt] ?? destination,
      currentStep: Math.max(0, currentStep),
    };
  }, [route, path, point, destination]);

  const aimAt = guide?.turnPoint ?? destination;
  const heading = point === null ? null : cardinal(bearingDeg(point, aimAt));

  const markers = useMemo<MapMarker[]>(() => {
    const pins: MapMarker[] = [];
    if (point !== null) {
      pins.push({ id: "me", lat: point.lat, lng: point.lng, label: "Tú", kind: "live" });
    }
    pins.push({ id: "to", lat: destination.lat, lng: destination.lng, label: `Recogida · ${target.dogName ?? "Un perro"}`, kind: "next" });
    return pins;
  }, [point, destination, target.dogName]);

  // While following, every new position re-centres the map; with it off, only
  // the button does, so he can look around the neighbourhood in peace.
  useEffect(() => {
    if (follow && point !== null) {
      setCenterKey((key) => key + 1);
    }
  }, [point, follow]);
  const focus = point === null ? null : { lat: point.lat, lng: point.lng, key: centerKey, zoom: 17 };

  const dog = target.dogName ?? "el perro";
  let headline = "Buscando tu ubicación…";
  let hint = `Vas hacia la recogida de ${dog}.`;
  if (arrived) {
    headline = `Llegaste donde ${dog}`;
    hint = "Ya puedes recoger al perro.";
  } else if (guide !== null) {
    headline = guide.instruction;
    hint = `En ${formatDistance(guide.toTurnKm)} · faltan ${formatDistance(guide.remainingKm)} · ${walkMinutes(guide.remainingKm)} min`;
  } else if (direct !== null) {
    headline = `${formatDistance(direct)} · ${walkMinutes(direct)} min`;
    hint = `La recogida está ${heading}. Distancia aproximada en línea recta.`;
  }

  return (
    <section className="wnav" aria-label={`Cómo llegar a ${dog}`}>
      <div className="glass wg__card wnav__head">
        <button type="button" className="wg__ghost wnav__back" onClick={onClose}>← Volver a la ruta</button>
        <div className="wnav__stat">
          <span className="wnav__arrow" aria-hidden="true" data-ready={point !== null ? "" : undefined}>
            <svg viewBox="0 0 24 24" style={point === null ? undefined : { transform: `rotate(${bearingDeg(point, aimAt)}deg)` }}>
              <path d="M12 3l7 17-7-4-7 4z" fill="currentColor" />
            </svg>
          </span>
          <div>
            <strong className="wnav__km" role="status">{headline}</strong>
            <p className="wg__muted">{hint}</p>
            {target.label ? <p className="wnav__address"><PinIcon /> {target.label}</p> : null}
          </div>
        </div>
        {error !== null ? <p className="wg__warn" role="alert">{error}</p> : null}
        {!demo && !arrived && point !== null && route === null ? (
          <p className={routeLoading ? "wg__muted" : "wg__warn"}>
            {routeLoading
              ? "Calculando la ruta por calles…"
              : "No pudimos cargar las calles. Reintentaremos en unos segundos."}
          </p>
        ) : null}
      </div>

      <div className="wroute__map wnav__map">
        <MarkersMap
          label={`Mapa hacia ${dog}`}
          markers={markers}
          connect={route !== null}
          path={route?.geometry ?? null}
          autoFit={false}
          focus={focus}
        />
        <button
          type="button"
          className="wg__ghost wroute__center"
          aria-pressed={follow}
          onClick={() => {
            setFollow((on) => !on);
            setCenterKey((key) => key + 1);
          }}
        >
          <PinIcon /> {follow ? "Siguiéndote" : "Centrar en mí"}
        </button>
      </div>

      {route !== null && route.steps.length > 0 ? (
        <ol className="glass wg__card wnav__steps" aria-label="Indicaciones">
          {route.steps.map((step, index) => (
            <li
              key={`${step.startIndex}-${step.text}`}
              aria-current={guide !== null && index === guide.currentStep ? "step" : undefined}
            >
              <span>{step.text}</span>
              <strong>{formatDistance(step.distanceM / 1000)}</strong>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="glass wg__card wnav__actions">
        {target.ownerPhone ? (
          <a className="wg__ghost wroute__link" href={`tel:${target.ownerPhone}`} aria-label={`Llamar a ${target.ownerName ?? "el dueño"}`}>
            <PhoneIcon /> Llamar
          </a>
        ) : null}
        {shared ? (
          <p className="wnav__shared" role="status">El dueño te ve llegar en su mapa.</p>
        ) : (
          <button type="button" className="wg__ghost wnav__go" disabled={sharing} onClick={() => void setOff()}>
            Voy en camino
          </button>
        )}
        {shareError !== null ? <p className="wg__warn" role="alert">{shareError}</p> : null}
        {onStart !== undefined ? (
          <button type="button" className="wg__primary" disabled={busy} onClick={onStart} aria-label={`Iniciar paseo de ${dog}`}>
            {arrived ? "Llegué · Iniciar paseo" : "Iniciar paseo"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
