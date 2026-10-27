import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/apiError.js";
import { bogotaDate, formatCop, formatHourBogota, formatWhenBogota } from "../lib/format.js";
import {
  fetchDayRoute,
  fetchWalkDetail,
  sendGpsPoints,
  type DayRoute,
  type ReplayPoint,
  type WalkDetail,
} from "../lib/marketplace.js";
import { MarkersMap, type MapMarker } from "../map/MarkersMap.js";
import { DogLoader } from "../ui/DogLoader.js";
import "../owner/explore.css";

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
  return date === bogotaDate() ? "Hoy" : date;
}

const STATUS_LABEL = { assigned: "Pendiente", in_walk: "En curso", done: "Hecho" } as const;

function routesError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return error.errorId !== null
        ? `Algo falló de nuestro lado. Código: ${error.errorId}`
        : "Algo falló de nuestro lado.";
    }
    if (error.status === 404) {
      return "Este paseo no existe o no es tuyo";
    }
    if (error.status === 429) {
      return "Espera un momento";
    }
  }
  return fallback;
}

/** Streams the walker's position to the API in batches while the toggle is on. */
function GpsSender({ walkId }: { walkId: string }) {
  const [on, setOn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const buffer = useRef<ReplayPoint[]>([]);
  const lastEpoch = useRef(0);

  useEffect(() => {
    if (!on) {
      return;
    }
    if (typeof navigator === "undefined" || navigator.geolocation === undefined) {
      setMessage("Tu navegador no permite ubicarte.");
      setOn(false);
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        // Points must be strictly increasing in time.
        const atEpoch = Math.max(Math.floor(position.timestamp / 1000), lastEpoch.current + 1);
        lastEpoch.current = atEpoch;
        buffer.current.push({ lat: position.coords.latitude, lng: position.coords.longitude, atEpoch });
      },
      () => setMessage("No pudimos obtener tu ubicación."),
      { enableHighAccuracy: true },
    );
    const id = window.setInterval(() => {
      const points = buffer.current.splice(0, 20);
      if (points.length === 0) {
        return;
      }
      void sendGpsPoints(walkId, points).catch((failure: unknown) => {
        if (failure instanceof ApiError && failure.status === 409) {
          setOn(false);
          setMessage("El paseo ya no está en curso.");
        }
      });
    }, GPS_BATCH_MS);
    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(id);
    };
  }, [on, walkId]);

  return (
    <div>
      <button type="button" className="explore__small explore__small--lime" aria-pressed={on} onClick={() => setOn((value) => !value)}>
        {on ? "Dejar de compartir mi ubicación" : "Compartir mi ubicación"}
      </button>
      {message !== null ? <p className="explore__hint" role="status">{message}</p> : null}
    </div>
  );
}

function StopDetail({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<WalkDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchWalkDetail(requestId)
      .then((loaded) => isMounted && setDetail(loaded))
      .catch((failure: unknown) => isMounted && setError(routesError(failure, "No pudimos cargar el paseo.")));
    return () => {
      isMounted = false;
    };
  }, [requestId]);

  return (
    <div className="explore">
      <button type="button" className="explore__small" onClick={onBack}>← Volver a la ruta</button>
      {error !== null ? <p className="explore__error" role="alert">{error}</p> : null}
      {detail === null && error === null ? <DogLoader label="Cargando el paseo…" /> : null}
      {detail !== null ? (
        <>
          <header className="explore__head">
            <h1 className="explore__title">{detail.dog.name}</h1>
            <p className="explore__subtitle">
              {formatWhenBogota(detail.requestedTime)} · {Math.round(detail.durationHours * 60)} min · {formatCop(detail.priceCop)}
            </p>
          </header>
          {detail.allowedActions.includes("send_gps") ? <GpsSender walkId={requestId} /> : null}
          <ul className="explore__list" aria-label="Línea de tiempo">
            {detail.timeline.map((entry) => (
              <li key={`${entry.kind}-${entry.at}`} className="explore__offer">
                <div className="explore__offer-main">
                  <strong>{entry.kind === "check_in" ? "Recogida" : entry.kind === "check_out" ? "Entrega" : entry.kind}</strong>
                  <span>{formatHourBogota(entry.at)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** Rutas (walker): the day's won walks as one route, ordered by the server. */
export function WalkerRoutesScreen({ userId }: { userId: string }) {
  const [date, setDate] = useState(() => bogotaDate());
  const [route, setRoute] = useState<DayRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
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
  }, [userId, date]);

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

  if (openId !== null) {
    return <StopDetail requestId={openId} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="explore">
      <header className="explore__head">
        <h1 className="explore__title">Rutas</h1>
        {route !== null ? (
          <p className="explore__subtitle">
            {dayLabel(route.date)} · {route.stops.length} {route.stops.length === 1 ? "paseo" : "paseos"} · {km(route.totalKm)} km · {route.totalMinutes} min
          </p>
        ) : null}
      </header>

      <div className="explore__offer-actions">
        <button type="button" className="explore__small" aria-label="Día anterior" onClick={() => setDate(shiftDay(date, -1))}>‹</button>
        <strong>{dayLabel(date)}</strong>
        <button type="button" className="explore__small" aria-label="Día siguiente" onClick={() => setDate(shiftDay(date, 1))}>›</button>
      </div>

      {error !== null ? <p className="explore__error" role="alert">{error}</p> : null}
      {route === null && error === null ? <DogLoader label="Armando tu ruta…" /> : null}

      {route !== null && route.stops.length === 0 ? (
        <p className="explore__empty">No tienes paseos este día. Mira Solicitudes</p>
      ) : null}

      {route !== null && route.stops.length > 0 ? (
        <>
          <MarkersMap label="Mapa de la ruta" markers={markers} connect />
          <ol className="explore__list" aria-label="Paradas">
            {route.stops.map((stop, index) => (
              <li key={stop.requestId} className="explore__offer" data-status={stop.status} data-next={stop.requestId === route.nextStopId ? "" : undefined}>
                <div className="explore__offer-main">
                  <span className="explore__hint">
                    {stop.legSource === "start" && route.start === null
                      ? "—"
                      : `${km(stop.legKm)} km · ${stop.legMinutes} min${stop.legSource === "straight" ? " (aprox.)" : ""}`}
                  </span>
                  <strong>
                    {stop.status === "done" ? "✓ " : stop.requestId === route.nextStopId ? "● " : ""}
                    {formatHourBogota(stop.requestedTime)} · {stop.dogName ?? "Un perro"}
                  </strong>
                  <span className="explore__offer-tip">{index + 1}. {STATUS_LABEL[stop.status]}</span>
                </div>
                <div className="explore__offer-actions">
                  <button
                    type="button"
                    className="explore__small explore__small--lime"
                    aria-label={`Abrir paseo de ${stop.dogName ?? "un perro"}`}
                    onClick={() => setOpenId(stop.requestId)}
                  >
                    Abrir
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}
