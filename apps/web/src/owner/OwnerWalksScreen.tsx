import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../lib/apiError.js";
import { formatCop, formatWhenBogota } from "../lib/format.js";
import {
  cancelWalk,
  fetchLiveWalk,
  fetchOwnerWalks,
  fetchReplay,
  fetchWalkDetail,
  rateWalk,
  repeatWalk,
  reportNoShow,
  type LiveWalk,
  type WalkDetail,
  type WalkItem,
  type WalkStatus,
  type WalkTab,
} from "../lib/marketplace.js";
import { MarkersMap, type MapMarker } from "../map/MarkersMap.js";
import { DogLoader } from "../ui/DogLoader.js";
import { Pill } from "../ui/Pill.js";
import "./explore.css";

/** The live position is polled every 10 s while `track` is allowed. */
export const LIVE_POLL_MS = 10_000;

const TABS: { id: WalkTab; label: string }[] = [
  { id: "upcoming", label: "Programados" },
  { id: "active", label: "En curso" },
  { id: "past", label: "Pasados" },
];

export const STATUS_LABEL: Record<WalkStatus, string> = {
  assigned: "Programado",
  in_walk: "En curso",
  done: "Terminado",
  cancelled: "Cancelado",
  expired: "Sin paseador",
};

function walksError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return error.errorId !== null
        ? `Algo falló de nuestro lado. Código: ${error.errorId}`
        : "Algo falló de nuestro lado.";
    }
    if (error.status === 429) {
      return `Espera ${error.retryAfter ?? "unos"} s antes de intentarlo de nuevo.`;
    }
    if (error.status === 404) {
      return "Este paseo no existe o no es tuyo";
    }
  }
  return fallback;
}

type DetailProps = {
  walkId: string;
  onBack: () => void;
  onRepeated: () => void;
  onChanged: () => void;
};

function WalkDetailView({ walkId, onBack, onRepeated, onChanged }: DetailProps) {
  const [detail, setDetail] = useState<WalkDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [live, setLive] = useState<LiveWalk | null>(null);
  const [replay, setReplay] = useState<MapMarker[] | null>(null);
  const [repeatAt, setRepeatAt] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await fetchWalkDetail(walkId));
      setError(null);
    } catch (failure: unknown) {
      setDetail(null);
      setError(walksError(failure, "No pudimos cargar el paseo."));
    }
  }, [walkId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canTrack = detail?.allowedActions.includes("track") === true;
  useEffect(() => {
    if (!canTrack) {
      setLive(null);
      return;
    }
    let stopped = false;
    async function tick() {
      try {
        const next = await fetchLiveWalk(walkId);
        if (!stopped) {
          setLive(next);
        }
      } catch (failure: unknown) {
        // 409: the walk ended, so stop polling and read the detail again.
        if (failure instanceof ApiError && failure.status === 409 && !stopped) {
          stopped = true;
          void load();
        }
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), LIVE_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [canTrack, walkId, load]);

  async function act(run: () => Promise<unknown>, done: string, kind: string) {
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      await run();
      setNotice(done);
      await load();
      onChanged();
    } catch (failure: unknown) {
      if (failure instanceof ApiError && failure.status === 409) {
        await load();
        setError(
          kind === "no-show"
            ? `${detail?.walker?.name ?? "El paseador"} está en el punto de recogida; llámalo`
            : "El paseo cambió; actualizamos la información.",
        );
      } else {
        setError(walksError(failure, "No pudimos completar la acción."));
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function showReplay() {
    setIsBusy(true);
    try {
      const result = (await fetchReplay(walkId)) as
        | { lat: number; lng: number }[]
        | { points?: { lat: number; lng: number }[] };
      const points = Array.isArray(result) ? result : (result.points ?? []);
      setReplay(points.map((p, index) => ({ id: `p${index}`, lat: p.lat, lng: p.lng, label: `Punto ${index + 1}` })));
    } catch (failure: unknown) {
      setError(walksError(failure, "No pudimos cargar el recorrido."));
    } finally {
      setIsBusy(false);
    }
  }

  const liveMarkers = useMemo<MapMarker[]>(
    () =>
      live?.position
        ? [{ id: "live", lat: live.position.lat, lng: live.position.lng, label: "Paseador", kind: "live" }]
        : [],
    [live],
  );

  if (detail === null) {
    return (
      <div className="explore">
        <button type="button" className="explore__small" onClick={onBack}>← Volver</button>
        {error !== null ? <p className="explore__error" role="alert">{error}</p> : <DogLoader label="Cargando el paseo…" />}
      </div>
    );
  }

  const allowed = new Set(detail.allowedActions);
  const walkerName = detail.walker?.name ?? "Paseador asignado";

  return (
    <div className="explore">
      <button type="button" className="explore__small" onClick={onBack}>← Volver</button>
      <header className="explore__head">
        <h1 className="explore__title">Paseo de {detail.dog.name}</h1>
        <p className="explore__subtitle">
          {formatWhenBogota(detail.requestedTime)} · {Math.round(detail.durationHours * 60)} min · {formatCop(detail.priceCop)}
        </p>
      </header>

      {detail.walker !== null ? (
        <p className="explore__hint">
          Con {walkerName}
          {detail.walker.ratingCount > 0 && detail.walker.allTimeRating !== null
            ? ` · ★ ${detail.walker.allTimeRating.toFixed(1)} (${detail.walker.ratingCount})`
            : " · Nuevo"}
        </p>
      ) : null}

      {error !== null ? <p className="explore__error" role="alert">{error}</p> : null}
      {notice !== null ? <p className="explore__notice" role="status">{notice}</p> : null}

      {canTrack ? (
        <>
          <MarkersMap label="Mapa en vivo" markers={liveMarkers} />
          <p className="explore__hint" role="status">
            {live?.position
              ? `${live.minutesElapsed} min de paseo`
              : "Esperando la primera ubicación del paseador"}
          </p>
        </>
      ) : null}

      {detail.report !== null ? (
        <section className="explore__offers" aria-label="Reporte">
          <h2 className="explore__section">Reporte</h2>
          <p>{detail.report.distanceKm.toFixed(2)} km · {detail.report.durationMin} min</p>
          {detail.report.status === "ok" && detail.report.text !== null ? <p>{detail.report.text}</p> : null}
        </section>
      ) : null}

      {detail.timeline.length > 0 ? (
        <ul className="explore__list" aria-label="Línea de tiempo">
          {detail.timeline.map((entry) => (
            <li key={`${entry.kind}-${entry.at}`} className="explore__offer">
              <div className="explore__offer-main">
                <strong>{entry.kind === "check_in" ? "Recogida" : entry.kind === "check_out" ? "Entrega" : entry.kind}</strong>
                <span>{formatWhenBogota(entry.at)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {replay !== null ? <MarkersMap label="Recorrido" markers={replay} connect /> : null}

      {allowed.has("rate") ? (
        <div className="explore__field" role="group" aria-label="Calificar">
          <span className="explore__label">Calificar a {walkerName}</span>
          <div className="explore__segments">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className="explore__segment"
                disabled={isBusy}
                aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
                onClick={() => void act(() => rateWalk(walkId, value), "¡Gracias por calificar!", "rate")}
              >
                {value}★
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="explore__offer-actions">
        {allowed.has("cancel") ? (
          <button
            type="button"
            className="explore__small"
            disabled={isBusy}
            onClick={() => void act(() => cancelWalk(walkId), "Cancelaste el paseo.", "cancel")}
          >
            Cancelar paseo
          </button>
        ) : null}
        {allowed.has("no_show") ? (
          <button
            type="button"
            className="explore__small"
            disabled={isBusy}
            onClick={() => void act(() => reportNoShow(walkId), "Avisamos que el paseador no llegó.", "no-show")}
          >
            El paseador no llegó
          </button>
        ) : null}
        {allowed.has("replay") ? (
          <button type="button" className="explore__small" disabled={isBusy} onClick={() => void showReplay()}>
            Ver recorrido
          </button>
        ) : null}
        {allowed.has("repeat") ? (
          <button type="button" className="explore__small explore__small--lime" onClick={() => setRepeatAt("")}>
            Repetir paseo
          </button>
        ) : null}
      </div>

      {repeatAt !== null ? (
        <div className="explore__field">
          <label className="explore__label" htmlFor="repeat-when">Nuevo día y hora</label>
          <input
            id="repeat-when"
            className="explore__input"
            type="datetime-local"
            value={repeatAt}
            onChange={(event) => setRepeatAt(event.target.value)}
          />
          <button
            type="button"
            className="explore__cta"
            disabled={isBusy || repeatAt === ""}
            onClick={() =>
              void act(
                async () => {
                  await repeatWalk(walkId, new Date(repeatAt).toISOString());
                  onRepeated();
                },
                "Publicamos tu solicitud.",
                "repeat",
              )
            }
          >
            Publicar de nuevo
          </button>
        </div>
      ) : null}
    </div>
  );
}

export type OwnerWalksScreenProps = {
  userId: string;
  /** A walk was repeated: its new open request waits in Explorar. */
  onRepeated?: () => void;
};

/** Mis paseos (owner): tabs, detail with the actions the API allows, live map. */
export function OwnerWalksScreen({ userId, onRepeated = () => undefined }: OwnerWalksScreenProps) {
  const [tab, setTab] = useState<WalkTab>("upcoming");
  const [items, setItems] = useState<WalkItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string | null) => {
      try {
        const page = await fetchOwnerWalks(userId, tab, cursor);
        setItems((current) => (cursor ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
        setError(null);
      } catch (failure: unknown) {
        setError(walksError(failure, "No pudimos cargar tus paseos."));
      } finally {
        setIsLoading(false);
      }
    },
    [userId, tab],
  );

  useEffect(() => {
    setIsLoading(true);
    setItems([]);
    void load();
  }, [load]);

  if (openId !== null) {
    return (
      <WalkDetailView
        walkId={openId}
        onBack={() => setOpenId(null)}
        onRepeated={onRepeated}
        onChanged={() => void load()}
      />
    );
  }

  return (
    <div className="explore">
      <header className="explore__head">
        <h1 className="explore__title">Mis paseos</h1>
      </header>

      <div className="explore__segments" role="group" aria-label="Estado de los paseos">
        {TABS.map((option) => (
          <Pill key={option.id} active={tab === option.id} onClick={() => setTab(option.id)}>
            {option.label}
          </Pill>
        ))}
      </div>

      {isLoading ? <DogLoader label="Cargando tus paseos…" /> : null}
      {error !== null ? <p className="explore__error" role="alert">{error}</p> : null}
      {!isLoading && error === null && items.length === 0 ? (
        <p className="explore__empty">No tienes paseos en esta pestaña.</p>
      ) : null}

      <ul className="explore__list">
        {items.map((walk) => (
          <li key={walk.id} className="explore__offer">
            <div className="explore__offer-main">
              <strong>{walk.dogName ?? "Tu perro"} · {STATUS_LABEL[walk.status]}</strong>
              <span>
                {formatWhenBogota(walk.requestedTime)} · {walk.walkerName ?? "Paseador asignado"} · {formatCop(walk.priceCop)}
              </span>
              {walk.canRate ? <span className="explore__offer-tip">Califica a {walk.walkerName ?? "tu paseador"}</span> : null}
              {walk.hasReport ? <span className="explore__offer-tip">Reporte</span> : null}
            </div>
            <div className="explore__offer-actions">
              <button
                type="button"
                className="explore__small explore__small--lime"
                aria-label={`Abrir paseo de ${walk.dogName ?? "tu perro"}`}
                onClick={() => setOpenId(walk.id)}
              >
                Abrir
              </button>
            </div>
          </li>
        ))}
      </ul>
      {nextCursor !== null ? (
        <button type="button" className="explore__small" onClick={() => void load(nextCursor)}>
          Ver más
        </button>
      ) : null}
    </div>
  );
}
