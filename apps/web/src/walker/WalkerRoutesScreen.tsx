import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/apiError.js";
import { bogotaDate, formatCop, formatHourBogota, formatWhenBogota } from "../lib/format.js";
import {
  checkInWalk,
  checkOutWalk,
  fetchDayRoute,
  fetchWalkDetail,
  sendGpsPoints,
  walkerCancelWalk,
  type ActiveWalk,
  type DayRoute,
  type DayRouteStop,
  type OverdueWalk,
  type ReplayPoint,
  type WalkDetail,
} from "../lib/marketplace.js";
import { MarkersMap, type MapMarker } from "../map/MarkersMap.js";
import { MascotSprite } from "../mascot/MascotSprite.js";
import { DogLoader } from "../ui/DogLoader.js";
import { ClockIcon, PhoneIcon, PinIcon, RouteIcon } from "../auth/icons.js";
import { NavPanel, type NavTarget } from "./NavPanel.js";
import { OnlinePill } from "./OnlinePill.js";
import { makePreviewRoute } from "../home/previewData.js";
import "./walker-glass.css";
import "./walker-routes.css";

/** The route is refetched every 60 s: stops change status as he checks in and out. */
export const ROUTE_POLL_MS = 60_000;
/** GPS points go up in batches every 12 s (the API allows 6 calls a minute). */
export const GPS_BATCH_MS = 12_000;

function shiftDay(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function km(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

function dayLabel(date: string): string {
  const today = bogotaDate();
  if (date === today) return "Hoy";
  if (date === shiftDay(today, 1)) return "Mañana";
  if (date === shiftDay(today, -1)) return "Ayer";
  return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

function clock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const STATUS_LABEL = { assigned: "Pendiente", in_walk: "En curso", done: "Hecho" } as const;
const STATUS_TONE = { assigned: "amber", in_walk: "lime", done: "muted" } as const;

function routesError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const text = error.message ?? "";
    if (error.status >= 500) {
      return error.errorId !== null
        ? `Algo falló de nuestro lado. Código: ${error.errorId}`
        : "Algo falló de nuestro lado.";
    }
    if (error.status === 403 && /token/i.test(text)) {
      return "Ya no te quedan cancelaciones disponibles.";
    }
    if (error.status === 403 || error.status === 404) {
      return "Este paseo no existe o no es tuyo";
    }
    if (error.status === 409) {
      return "Este paseo ya cambió de estado. Actualizamos tu ruta.";
    }
    if (error.status === 429) {
      return "Espera un momento";
    }
  }
  return fallback;
}

/** The current time, ticking every second while `on`. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [on]);
  return now;
}

type GpsState = "starting" | "sharing" | "blocked";

/** Streams the walker's position to the API in batches while a walk is in progress. */
function useGpsStream(walkId: string | null, onEnded: () => void, demo = false): GpsState {
  const [state, setState] = useState<GpsState>("starting");
  const buffer = useRef<ReplayPoint[]>([]);
  const lastEpoch = useRef(0);
  const ended = useRef(onEnded);
  ended.current = onEnded;

  useEffect(() => {
    if (walkId === null) return;
    if (demo) {
      setState("sharing");
      return;
    }
    if (typeof navigator === "undefined" || navigator.geolocation === undefined) {
      setState("blocked");
      return;
    }
    setState("starting");
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        // Points must be strictly increasing in time.
        const atEpoch = Math.max(Math.floor(position.timestamp / 1000), lastEpoch.current + 1);
        lastEpoch.current = atEpoch;
        buffer.current.push({ lat: position.coords.latitude, lng: position.coords.longitude, atEpoch });
        setState("sharing");
      },
      () => setState("blocked"),
      { enableHighAccuracy: true },
    );
    const id = window.setInterval(() => {
      const points = buffer.current.splice(0, 20);
      if (points.length === 0) return;
      void sendGpsPoints(walkId, points).catch((failure: unknown) => {
        if (failure instanceof ApiError && failure.status === 409) {
          ended.current();
        }
      });
    }, GPS_BATCH_MS);
    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(id);
    };
  }, [walkId, demo]);

  return state;
}

/** Two-step button: the first tap asks, the second one does it. */
function Confirm({
  question,
  yes,
  no,
  busy,
  onYes,
  onNo,
}: {
  question: string;
  yes: string;
  no: string;
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="wroute__confirm" role="group" aria-label={question}>
      <p>{question}</p>
      <div className="wroute__row">
        <button type="button" className="wg__danger" disabled={busy} onClick={onYes}>{yes}</button>
        <button type="button" className="wg__ghost" disabled={busy} onClick={onNo}>{no}</button>
      </div>
    </div>
  );
}

function CallLink({ name, phone }: { name: string | null | undefined; phone: string | null | undefined }) {
  if (!phone) return null;
  return (
    <a className="wg__ghost wroute__link" href={`tel:${phone}`} aria-label={`Llamar a ${name ?? "el dueño"}`}>
      <PhoneIcon /> Llamar
    </a>
  );
}

function ActiveCard({
  walk,
  busy,
  demo,
  onFinish,
  onEnded,
}: {
  walk: ActiveWalk;
  busy: boolean;
  demo: boolean;
  onFinish: () => void;
  onEnded: () => void;
}) {
  const now = useNow(true);
  const gps = useGpsStream(walk.requestId, onEnded, demo);
  const [asking, setAsking] = useState(false);
  const started = Date.parse(walk.startedAt ?? walk.requestedTime);
  const elapsed = Number.isNaN(started) ? 0 : (now - started) / 1000;
  const goal = Math.max(1, walk.durationHours * 3600);
  const progress = Math.min(1, elapsed / goal);
  const done = elapsed >= goal;
  const minutes = Math.round(walk.durationHours * 60);
  const dog = walk.dogName ?? "tu perro";
  const radius = 52;
  const length = 2 * Math.PI * radius;

  return (
    <section className="glass wg__card wroute__active wg__rise" aria-label={`Paseo en curso con ${dog}`}>
      <div className="wroute__active-top">
        <span className="wg__chip" data-tone="lime">En curso</span>
        <span className="wroute__gps" data-state={gps}>
          <span className="wg__dot" aria-hidden="true" />
          {gps === "blocked" ? "Activa la ubicación para compartir el recorrido" : "Compartiendo ubicación"}
        </span>
      </div>
      <div className="wroute__active-body">
        <div className="wroute__timer" data-done={done ? "" : undefined} role="timer" aria-label={`Llevas ${clock(elapsed)} de ${minutes} minutos`}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle className="wroute__timer-track" cx="60" cy="60" r={radius} />
            <circle
              className="wroute__timer-fill"
              cx="60"
              cy="60"
              r={radius}
              strokeDasharray={length}
              strokeDashoffset={length * (1 - progress)}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <strong>{clock(elapsed)}</strong>
          <span>de {minutes} min</span>
        </div>
        <div className="wroute__active-info">
          <h2 className="wroute__dog">{dog}</h2>
          {walk.ownerName ? <p className="wg__muted">Dueño: {walk.ownerName}</p> : null}
          <p className="wg__muted">{done ? "Tiempo cumplido. Ya puedes entregarlo." : `Recogido · gana ${formatCop(walk.netCop)} netos`}</p>
          <div className="wroute__row">
            <CallLink name={walk.ownerName} phone={walk.ownerPhone} />
          </div>
        </div>
      </div>
      {asking ? (
        <Confirm
          question={`¿Terminar el paseo de ${dog}?`}
          yes="Sí, terminar"
          no="Seguir paseando"
          busy={busy}
          onYes={onFinish}
          onNo={() => setAsking(false)}
        />
      ) : (
        <button type="button" className="wg__primary" disabled={busy} onClick={() => setAsking(true)}>
          Terminar paseo
        </button>
      )}
    </section>
  );
}

function OverdueCard({
  walks,
  busyId,
  blocked,
  onStart,
  onCancel,
  onNavigate,
}: {
  walks: OverdueWalk[];
  busyId: string | null;
  blocked: boolean;
  onStart: (walk: OverdueWalk) => void;
  onCancel: (walk: OverdueWalk) => void;
  onNavigate: (walk: OverdueWalk) => void;
}) {
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <section className="glass wg__card wroute__overdue wg__rise" aria-label="Paseos atrasados">
      <h2 className="wg__card-title">Paseos atrasados</h2>
      <p className="wg__muted">
        Ya pasó su hora y siguen pendientes. Inícialos si los vas a hacer, o cancélalos para que el dueño busque a otro paseador.
      </p>
      <ul className="wg__list">
        {walks.map((walk) => {
          const dog = walk.dogName ?? "un perro";
          const busy = busyId === walk.requestId;
          return (
            <li key={walk.requestId} className="wroute__late">
              <div className="wroute__late-main">
                <strong>{walk.dogName ?? "Un perro"}</strong>
                <span className="wg__chip" data-tone="amber">{formatWhenBogota(walk.requestedTime)}</span>
              </div>
              {asking === walk.requestId ? (
                <Confirm
                  question={`¿Cancelar el paseo de ${dog}? Gasta 1 cancelación y vuelve a abrirse para otros paseadores.`}
                  yes="Sí, cancelar"
                  no="No"
                  busy={busy}
                  onYes={() => onCancel(walk)}
                  onNo={() => setAsking(null)}
                />
              ) : (
                <div className="wroute__row">
                  <button
                    type="button"
                    className="wg__primary"
                    disabled={busy || blocked}
                    aria-label={`Iniciar ahora el paseo de ${dog}`}
                    onClick={() => onStart(walk)}
                  >
                    Iniciar ahora
                  </button>
                  <button
                    type="button"
                    className="wg__danger"
                    disabled={busy}
                    aria-label={`Cancelar el paseo de ${dog}`}
                    onClick={() => setAsking(walk.requestId)}
                  >
                    Cancelar paseo
                  </button>
                  {walk.pickupLat !== null && walk.pickupLat !== undefined ? (
                    <button
                      type="button"
                      className="wg__ghost wroute__link"
                      aria-label={`Cómo llegar a ${dog}`}
                      onClick={() => onNavigate(walk)}
                    >
                      <RouteIcon /> Cómo llegar
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {blocked ? <p className="wg__muted">Termina el paseo en curso para iniciar otro.</p> : null}
    </section>
  );
}

function NextStopCard({
  stop,
  hasStart,
  busy,
  blocked,
  onStart,
  onNavigate,
}: {
  stop: DayRouteStop;
  hasStart: boolean;
  busy: boolean;
  blocked: boolean;
  onStart: () => void;
  onNavigate: () => void;
}) {
  const dog = stop.dogName ?? "un perro";
  return (
    <section className="glass wg__card wroute__next wg__rise" aria-label="Siguiente parada">
      <p className="wroute__eyebrow">Siguiente parada</p>
      <div className="wroute__next-top">
        <div>
          <h2 className="wroute__dog">{stop.dogName ?? "Un perro"}</h2>
          {stop.ownerName ? <p className="wg__muted">Dueño: {stop.ownerName}</p> : null}
        </div>
        {stop.netCop !== undefined ? <strong className="wroute__pay">{formatCop(stop.netCop)}</strong> : null}
      </div>
      <ul className="wg__chips">
        <li className="wg__chip"><ClockIcon /> {formatHourBogota(stop.requestedTime)}</li>
        {stop.durationHours !== undefined ? <li className="wg__chip">{Math.round(stop.durationHours * 60)} min</li> : null}
        {hasStart ? <li className="wg__chip"><PinIcon /> a {km(stop.legKm)} km · {stop.legMinutes} min</li> : null}
      </ul>
      <div className="wroute__row">
        <button type="button" className="wg__ghost wroute__link" onClick={onNavigate} aria-label={`Cómo llegar a ${dog}`}>
          <RouteIcon /> Cómo llegar
        </button>
        <CallLink name={stop.ownerName} phone={stop.ownerPhone} />
      </div>
      <button type="button" className="wg__primary" disabled={busy || blocked} onClick={onStart} aria-label={`Iniciar paseo de ${dog}`}>
        Iniciar paseo
      </button>
      {blocked ? <p className="wg__muted">Termina el paseo en curso para iniciar otro.</p> : null}
    </section>
  );
}

/** What the detail shows in preview: built from the stop itself, no API call. */
function demoDetail(stop: DayRouteStop): WalkDetail {
  const start = Date.parse(stop.requestedTime);
  const hours = stop.durationHours ?? 1;
  const timeline =
    stop.status === "assigned"
      ? []
      : [
          { kind: "check_in", at: new Date(start + 2 * 60_000).toISOString() },
          ...(stop.status === "done" ? [{ kind: "check_out", at: new Date(start + hours * 3_600_000).toISOString() }] : []),
        ];
  return {
    id: stop.requestId, status: stop.status, dog: { id: stop.requestId, name: stop.dogName ?? "Un perro" }, walker: null,
    requestedTime: stop.requestedTime, windowEnd: null, durationHours: hours, priceCop: Math.round((stop.netCop ?? 0) / 0.9),
    offerCount: 1, timeline, rating: stop.status === "done" ? 5 : null, report: null, allowedActions: [],
  };
}

function StopDetail({ requestId, demo }: { requestId: string; demo?: DayRouteStop }) {
  const [detail, setDetail] = useState<WalkDetail | null>(() => (demo ? demoDetail(demo) : null));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    let isMounted = true;
    fetchWalkDetail(requestId)
      .then((loaded) => isMounted && setDetail(loaded))
      .catch((failure: unknown) => isMounted && setError(routesError(failure, "No pudimos cargar el paseo.")));
    return () => {
      isMounted = false;
    };
    // The demo stop is fixed for the life of the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  if (error !== null) return <p className="wg__warn" role="alert">{error}</p>;
  if (detail === null) return <DogLoader label="Cargando el paseo…" />;
  return (
    <div className="wroute__detail">
      <p className="wg__muted">
        {formatWhenBogota(detail.requestedTime)} · {Math.round(detail.durationHours * 60)} min · {formatCop(detail.priceCop)}
      </p>
      {detail.timeline.length > 0 ? (
        <ul className="wroute__timeline" aria-label="Línea de tiempo">
          {detail.timeline.map((entry) => (
            <li key={`${entry.kind}-${entry.at}`}>
              <strong>{entry.kind === "check_in" ? "Recogida" : entry.kind === "check_out" ? "Entrega" : entry.kind}</strong>
              <span>{formatHourBogota(entry.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="wg__muted">Aún no empieza.</p>
      )}
      {detail.rating !== null ? <p className="wg__muted">Calificación del dueño: {"★".repeat(detail.rating)}</p> : null}
    </div>
  );
}

type Notice = { kind: "done"; text: string } | { kind: "info"; text: string };

/** The pickup behind a "Cómo llegar": a stop of the day, or a late walk. O(n). */
function findNavTarget(route: DayRoute | null, requestId: string | null): NavTarget | null {
  if (route === null || requestId === null) {
    return null;
  }
  const stop = route.stops.find((item) => item.requestId === requestId);
  if (stop !== undefined) {
    return {
      requestId: stop.requestId,
      dogName: stop.dogName,
      lat: stop.pickupLat,
      lng: stop.pickupLng,
      ownerName: stop.ownerName,
      ownerPhone: stop.ownerPhone,
    };
  }
  const late = (route.overdue ?? []).find((item) => item.requestId === requestId);
  if (late === undefined || late.pickupLat === null || late.pickupLat === undefined
      || late.pickupLng === null || late.pickupLng === undefined) {
    return null;
  }
  return { requestId: late.requestId, dogName: late.dogName, lat: late.pickupLat, lng: late.pickupLng };
}

export type WalkerRoutesScreenProps = {
  userId: string;
  onGoHome?: () => void;
  onGoRequests?: () => void;
  /** Dev preview: a demo day whose buttons change it locally, never the API. */
  preview?: boolean;
};

type Action = "check_in" | "check_out" | "cancel";

/** Apply an action to the demo route the way the server would. */
function applyDemo(route: DayRoute, requestId: string, action: Action): DayRoute {
  const now = new Date().toISOString();
  if (action === "cancel") {
    return { ...route, overdue: (route.overdue ?? []).filter((walk) => walk.requestId !== requestId) };
  }
  if (action === "check_out") {
    const stops = route.stops.map((stop) => (stop.requestId === requestId ? { ...stop, status: "done" as const } : stop));
    return { ...route, stops, active: null, nextStopId: stops.find((stop) => stop.status !== "done")?.requestId ?? null };
  }
  const stop = route.stops.find((item) => item.requestId === requestId);
  const late = (route.overdue ?? []).find((walk) => walk.requestId === requestId);
  const source = stop ?? late;
  if (source === undefined) return route;
  const stops = route.stops.map((item) => (item.requestId === requestId ? { ...item, status: "in_walk" as const } : item));
  return {
    ...route,
    stops,
    overdue: (route.overdue ?? []).filter((walk) => walk.requestId !== requestId),
    nextStopId: stops.find((item) => item.status !== "done")?.requestId ?? null,
    active: {
      requestId,
      dogName: source.dogName,
      requestedTime: source.requestedTime,
      durationHours: source.durationHours ?? 1,
      startedAt: now,
      netCop: stop?.netCop ?? 16200,
      ownerName: stop?.ownerName ?? "Andrés Burbano",
      ownerPhone: stop?.ownerPhone ?? null,
      pickupLat: stop?.pickupLat ?? null,
      pickupLng: stop?.pickupLng ?? null,
    },
  };
}

/** Rutas (walker): the day's won walks as one route, the walk in progress and the late ones. */
export function WalkerRoutesScreen({ userId, onGoHome = () => undefined, onGoRequests, preview = false }: WalkerRoutesScreenProps) {
  const [date, setDate] = useState(() => bogotaDate());
  const [route, setRoute] = useState<DayRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: number } | null>(null);
  const [navId, setNavId] = useState<string | null>(null);

  const demoRef = useRef<Record<string, DayRoute>>({});

  const load = useCallback(async () => {
    if (preview) {
      demoRef.current[date] ??= makePreviewRoute(date);
      setRoute(demoRef.current[date]!);
      return;
    }
    try {
      setRoute(await fetchDayRoute(userId, date));
      setError(null);
    } catch (failure: unknown) {
      if (failure instanceof ApiError && failure.status === 400) {
        setDate(bogotaDate());
      } else if (!(failure instanceof ApiError && failure.status === 429)) {
        // A 429 keeps the last route on screen.
        setError(routesError(failure, "No pudimos cargar tu ruta."));
      }
    }
  }, [userId, date, preview]);

  useEffect(() => {
    setRoute(null);
    void load();
    const id = window.setInterval(() => void load(), ROUTE_POLL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") {
        void load();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  async function run(requestId: string, kind: Action, action: () => Promise<unknown>, after: Notice | null) {
    setBusyId(requestId);
    setActionError(null);
    if (preview) {
      // The change applies to every demo day (a late walk shows on all of them).
      for (const [day, value] of Object.entries(demoRef.current)) {
        demoRef.current[day] = applyDemo(value, requestId, kind);
      }
      setNotice(after);
      setBusyId(null);
      await load();
      return;
    }
    try {
      await action();
      setNotice(after);
    } catch (failure: unknown) {
      setActionError(routesError(failure, "No pudimos actualizar el paseo."));
    } finally {
      setBusyId(null);
      await load();
    }
  }

  const active = route?.active ?? null;
  const overdue = (route?.overdue ?? []).filter((walk) => walk.requestId !== active?.requestId);
  const nextStop = route?.stops.find((stop) => stop.status === "assigned" && stop.requestId === route.nextStopId)
    ?? route?.stops.find((stop) => stop.status === "assigned")
    ?? null;
  const overdueIds = new Set(overdue.map((walk) => walk.requestId));
  const showNext = nextStop !== null && !overdueIds.has(nextStop.requestId);

  const markers = useMemo<MapMarker[]>(() => {
    if (route === null) {
      return [];
    }
    const pins: MapMarker[] = route.start ? [{ id: "me", lat: route.start.lat, lng: route.start.lng, label: "Tú", kind: "me" }] : [];
    route.stops.forEach((stop, index) => {
      pins.push({
        id: stop.requestId,
        lat: stop.pickupLat,
        lng: stop.pickupLng,
        label: `${index + 1} · ${stop.dogName ?? "Un perro"}`,
        kind: stop.status === "done" ? "done" : stop.requestId === route.nextStopId ? "next" : "stop",
      });
    });
    return pins;
  }, [route]);

  const startWalk = (requestId: string, dog: string | null) => {
    setNavId(null);
    void run(requestId, "check_in", () => checkInWalk(requestId), { kind: "info", text: `Paseo con ${dog ?? "tu perro"} iniciado. Compartimos tu ubicación con el dueño.` });
  };

  // Cómo llegar: the pickup and his live position on this same map, never another app.
  const navTarget = findNavTarget(route, navId);
  if (navTarget !== null) {
    return (
      <div className="wglass wroute">
        <header className="wg__head">
          <div>
            <h1 className="wg__title">Cómo llegar</h1>
            <p className="wg__sub">Recogida de {navTarget.dogName ?? "un perro"}</p>
          </div>
          <OnlinePill onOpen={onGoHome} />
        </header>
        <NavPanel
          walkerId={userId}
          target={navTarget}
          start={route?.start ?? null}
          demo={preview}
          busy={busyId === navTarget.requestId}
          onStart={active === null ? () => startWalk(navTarget.requestId, navTarget.dogName) : undefined}
          onClose={() => setNavId(null)}
        />
      </div>
    );
  }

  return (
    <div className="wglass wroute">
      <header className="wg__head">
        <div>
          <h1 className="wg__title">Rutas</h1>
          {route !== null ? (
            <p className="wg__sub">
              {dayLabel(route.date)} · {route.stops.length} {route.stops.length === 1 ? "paseo" : "paseos"} · {km(route.totalKm)} km · {route.totalMinutes} min
            </p>
          ) : (
            <p className="wg__sub">Tus paseos del día, en orden.</p>
          )}
        </div>
        <OnlinePill onOpen={onGoHome} />
      </header>

      <div className="wroute__days" role="group" aria-label="Día de la ruta">
        <button type="button" className="wg__round" aria-label="Día anterior" onClick={() => setDate(shiftDay(date, -1))}>‹</button>
        <button type="button" className="wg__filter" aria-pressed={date === bogotaDate()} onClick={() => setDate(bogotaDate())}>Hoy</button>
        <button
          type="button"
          className="wg__filter"
          aria-pressed={date === shiftDay(bogotaDate(), 1)}
          onClick={() => setDate(shiftDay(bogotaDate(), 1))}
        >
          Mañana
        </button>
        {date !== bogotaDate() && date !== shiftDay(bogotaDate(), 1) ? (
          <span className="wroute__day">{dayLabel(date)}</span>
        ) : null}
        <button type="button" className="wg__round" aria-label="Día siguiente" onClick={() => setDate(shiftDay(date, 1))}>›</button>
      </div>

      {notice !== null ? (
        <div className={notice.kind === "done" ? "wg__ok wroute__notice" : "wg__ok wroute__notice wroute__notice--info"} role="status">
          {notice.kind === "done" ? <MascotSprite pose="jump" size={72} /> : null}
          <span>{notice.text}</span>
          <button type="button" className="wg__ghost" onClick={() => setNotice(null)}>Listo</button>
        </div>
      ) : null}
      {actionError !== null ? <p className="wg__warn" role="alert">{actionError}</p> : null}

      {active !== null ? (
        <ActiveCard
          walk={active}
          busy={busyId === active.requestId}
          demo={preview}
          onEnded={() => void load()}
          onFinish={() =>
            void run(active.requestId, "check_out", () => checkOutWalk(active.requestId), {
              kind: "done",
              text: `Paseo terminado · +${formatCop(active.netCop)} netos`,
            })
          }
        />
      ) : null}

      {overdue.length > 0 ? (
        <OverdueCard
          walks={overdue}
          busyId={busyId}
          blocked={active !== null}
          onStart={(walk) => startWalk(walk.requestId, walk.dogName)}
          onNavigate={(walk) => setNavId(walk.requestId)}
          onCancel={(walk) =>
            void run(walk.requestId, "cancel", () => walkerCancelWalk(walk.requestId), {
              kind: "info",
              text: `Cancelaste el paseo de ${walk.dogName ?? "un perro"}. Volvió a quedar abierto para otros paseadores.`,
            })
          }
        />
      ) : null}

      {error !== null ? (
        <div className="glass wg__card" role="alert">
          <p className="wg__muted">{error}</p>
          <button type="button" className="wg__primary" onClick={() => void load()}>Reintentar</button>
        </div>
      ) : null}
      {route === null && error === null ? <DogLoader label="Armando tu ruta…" pose="walk" /> : null}

      {route !== null && route.stops.length === 0 ? (
        <div className="glass wg__empty">
          <MascotSprite pose="wait" size={96} />
          <p>No tienes paseos este día. Mira Solicitudes</p>
          <ol className="wroute__how" aria-label="Cómo llega un paseo a Rutas">
            <li><strong>1.</strong> Conéctate y oferta en Solicitudes.</li>
            <li><strong>2.</strong> Cuando el dueño te elige, el paseo aparece aquí en su día.</li>
            <li><strong>3.</strong> Llegas, tocas Iniciar paseo y al final Terminar paseo.</li>
          </ol>
          {onGoRequests !== undefined ? (
            <button type="button" className="wg__primary" onClick={onGoRequests}>Ver solicitudes</button>
          ) : null}
        </div>
      ) : null}

      {route !== null && route.stops.length > 0 ? (
        <div className="wroute__grid">
          <div className="wroute__map">
            <MarkersMap label="Mapa de la ruta" markers={markers} connect focus={focus} />
            {route.start !== null ? (
              <button
                type="button"
                className="wg__ghost wroute__center"
                onClick={() => setFocus({ lat: route.start!.lat, lng: route.start!.lng, key: Date.now() })}
              >
                <PinIcon /> Centrar en mí
              </button>
            ) : null}
          </div>

          <div className="wroute__side">
            {showNext && nextStop !== null ? (
              <NextStopCard
                stop={nextStop}
                hasStart={route.start !== null}
                busy={busyId === nextStop.requestId}
                blocked={active !== null}
                onStart={() => startWalk(nextStop.requestId, nextStop.dogName)}
                onNavigate={() => setNavId(nextStop.requestId)}
              />
            ) : null}

            <ol className="wg__list wroute__stops" aria-label="Paradas">
              {route.stops.map((stop, index) => {
                const isNext = stop.requestId === route.nextStopId;
                const open = openId === stop.requestId;
                const dog = stop.dogName ?? "un perro";
                return (
                  <li
                    key={stop.requestId}
                    className="glass wroute__stop"
                    data-status={stop.status}
                    data-next={isNext ? "" : undefined}
                  >
                    <div className="wroute__stop-row">
                      <span className="wroute__badge">
                        {stop.status === "done" ? "✓" : isNext ? "●" : index + 1}
                      </span>
                      <div className="wroute__stop-main">
                        <strong>{formatHourBogota(stop.requestedTime)} · {stop.dogName ?? "Un perro"}</strong>
                        <ul className="wg__chips">
                          <li className="wg__chip" data-tone={STATUS_TONE[stop.status]}>{index + 1}. {STATUS_LABEL[stop.status]}</li>
                          <li className="wg__chip" data-tone="muted">
                            {stop.legSource === "start" && route.start === null
                              ? "—"
                              : `${km(stop.legKm)} km · ${stop.legMinutes} min${stop.legSource === "straight" ? " (aprox.)" : ""}`}
                          </li>
                        </ul>
                      </div>
                      <button
                        type="button"
                        className="wg__ghost wroute__open"
                        aria-expanded={open}
                        aria-label={`${open ? "Cerrar" : "Abrir"} paseo de ${dog}`}
                        onClick={() => setOpenId(open ? null : stop.requestId)}
                      >
                        {open ? "Cerrar" : "Ver"}
                      </button>
                    </div>
                    {open ? (
                      <>
                        <StopDetail requestId={stop.requestId} demo={preview ? stop : undefined} />
                        {stop.status === "assigned" ? (
                          <button
                            type="button"
                            className="wg__ghost wroute__link"
                            aria-label={`Cómo llegar a ${dog}`}
                            onClick={() => setNavId(stop.requestId)}
                          >
                            <RouteIcon /> Cómo llegar
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}
