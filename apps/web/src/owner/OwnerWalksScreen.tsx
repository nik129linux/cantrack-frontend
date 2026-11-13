import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../lib/apiError.js";
import { bogotaDate, formatCop, formatHourBogota, formatWhenBogota } from "../lib/format.js";
import {
  cancelWalk,
  fetchLiveWalk,
  fetchOwnerWalks,
  fetchReplay,
  fetchWalkDetail,
  fetchWalkSummary,
  rateWalk,
  repeatWalk,
  reportNoShow,
  type LiveWalk,
  type WalkDetail,
  type WalkItem,
  type WalkStatus,
  type WalkSummary,
  type WalkTab,
} from "../lib/marketplace.js";
import { MarkersMap, type MapMarker } from "../map/MarkersMap.js";
import { DogLoader } from "../ui/DogLoader.js";
import { MascotSprite } from "../mascot/MascotSprite.js";
import "./explore.css";
import "./owner-glass.css";
import "./owner-walks.css";

/** The live position is polled every 10 s while `track` is allowed. */
export const LIVE_POLL_MS = 10_000;

/** An assigned walk this late past its start is shown as "Pendiente". */
const STALE_AFTER_MS = 15 * 60_000;

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

const EMPTY_TEXT: Record<WalkTab, string> = {
  upcoming: "No tienes paseos programados. ¡Tu peludo está listo para salir!",
  active: "Ningún paseo en curso ahora mismo.",
  past: "Aquí verás los paseos terminados, con su reporte y recorrido.",
};

const dayLabel = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  weekday: "short",
  day: "numeric",
  month: "short",
});

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

function minutesLabel(total: number): string {
  if (total < 60) {
    return `${total} min`;
  }
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function kmLabel(km: number): string {
  return `${km.toLocaleString("es-CO", { maximumFractionDigits: 1 })} km`;
}

/** "Hoy", "Mañana", "Ayer" or "dom 25 oct" for a walk's Bogota day. */
function dayHeading(iso: string, now: Date): string {
  const day = bogotaDate(new Date(iso));
  const today = bogotaDate(now);
  const shift = (days: number) => bogotaDate(new Date(now.getTime() + days * 86_400_000));
  if (day === today) return "Hoy";
  if (day === shift(1)) return "Mañana";
  if (day === shift(-1)) return "Ayer";
  return dayLabel.format(new Date(iso));
}

/** "en 45 min", "en 3 h", "mañana 6:14 p. m." … for an upcoming start. */
function countdown(iso: string, now: Date): string {
  const diff = new Date(iso).getTime() - now.getTime();
  if (diff <= 0) {
    return "ya debió empezar";
  }
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `en ${minutes} min`;
  if (minutes < 6 * 60) return `en ${Math.round(minutes / 60)} h`;
  const heading = dayHeading(iso, now);
  return `${heading === "Hoy" ? "hoy" : heading === "Mañana" ? "mañana" : heading} ${formatHourBogota(iso)}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isStale(walk: { status: string; requestedTime: string }, now: Date): boolean {
  return walk.status === "assigned" && now.getTime() - new Date(walk.requestedTime).getTime() > STALE_AFTER_MS;
}

function Stars({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  return (
    <span className={`owalks__stars owalks__stars--${size}`} aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" data-on={n <= Math.round(value)}>★</span>
      ))}
    </span>
  );
}

function StatusChip({ status, stale }: { status: string; stale: boolean }) {
  const label = stale ? "Pendiente" : (STATUS_LABEL[status as WalkStatus] ?? status);
  return (
    <span className="owalks__chip" data-status={stale ? "stale" : status}>
      {status === "in_walk" ? <span className="owalks__live-dot" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

type Step = { label: string; at: string | null; done: boolean; current: boolean };

function progressSteps(detail: WalkDetail): Step[] {
  const at = (kind: string) => detail.timeline.find((entry) => entry.kind === kind)?.at ?? null;
  const checkIn = at("check_in");
  const checkOut = at("check_out");
  const status = detail.status;
  const assigned = detail.walker !== null && detail.walker.id !== null;
  const walking = status === "in_walk";
  const finished = status === "done" || checkOut !== null;
  const steps: Step[] = [
    { label: "Solicitado", at: null, done: true, current: false },
    { label: "Paseador asignado", at: null, done: assigned, current: status === "assigned" },
    { label: "Recogido", at: checkIn, done: checkIn !== null || walking || finished, current: false },
    { label: "Paseando", at: null, done: walking || finished, current: walking },
    { label: "Entregado", at: checkOut, done: finished, current: false },
  ];
  return steps;
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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [hoverStar, setHoverStar] = useState(0);
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
      setConfirmCancel(false);
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

  const back = (
    <button type="button" className="explore__small owalks__back" onClick={onBack}>← Mis paseos</button>
  );

  if (detail === null) {
    return (
      <div className="explore oglass owalks">
        {back}
        {error !== null ? (
          <div className="glass oglass__retry">
            <p className="explore__error" role="alert">{error}</p>
            <button type="button" className="explore__small explore__small--lime" onClick={() => void load()}>Reintentar</button>
          </div>
        ) : (
          <DogLoader label="Cargando el paseo…" />
        )}
      </div>
    );
  }

  const now = new Date();
  const allowed = new Set(detail.allowedActions);
  const walkerName = detail.walker?.name ?? "Paseador asignado";
  const minutes = Math.round(detail.durationHours * 60);
  const stale = isStale(detail, now);
  const ended = detail.status === "cancelled" || detail.status === "expired";
  const progress = live !== null && minutes > 0 ? Math.min(100, Math.round((live.minutesElapsed / minutes) * 100)) : 0;
  const report = detail.report;
  const pace = report !== null && report.distanceKm > 0 ? report.durationMin / report.distanceKm : null;
  const shownRating = hoverStar > 0 ? hoverStar : (detail.rating ?? 0);

  return (
    <div className="explore oglass owalks">
      {back}

      <section className="glass owalks__hero" aria-label="Paseo">
        <div className="owalks__hero-text">
          <StatusChip status={detail.status} stale={stale} />
          <h1 className="explore__title owalks__hero-title">Paseo de {detail.dog.name}</h1>
          <p className="owalks__hero-sub">{formatWhenBogota(detail.requestedTime)}</p>
          <ul className="owalks__facts">
            <li>⏱ {minutesLabel(minutes)}</li>
            <li>💵 {formatCop(detail.priceCop)}</li>
          </ul>
        </div>
        <img className="owalks__hero-art" src="/art/characters/dog-sit.webp" alt="" draggable={false} />
      </section>

      {detail.walker !== null && detail.walker.id !== null ? (
        <section className="glass owalks__walker" aria-label="Paseador">
          <span className="owalks__avatar" aria-hidden="true">{walkerName.slice(0, 1).toUpperCase()}</span>
          <div>
            <p className="owalks__walker-name">{walkerName}</p>
            <p className="owalks__walker-meta">
              {detail.walker.ratingCount > 0 && detail.walker.allTimeRating !== null
                ? `★ ${detail.walker.allTimeRating.toFixed(1)} · ${detail.walker.ratingCount} ${detail.walker.ratingCount === 1 ? "calificación" : "calificaciones"}`
                : "Paseador nuevo en CanTrack"}
            </p>
          </div>
        </section>
      ) : null}

      {stale ? (
        <p className="owalks__note" role="status">El paseador todavía no inicia este paseo. Si no llega, avísanos con “El paseador no llegó”.</p>
      ) : null}
      {error !== null ? <p className="explore__error" role="alert">{error}</p> : null}
      {notice !== null ? <p className="explore__notice" role="status">{notice}</p> : null}

      {ended ? null : (
        <section className="glass owalks__card" aria-label="Progreso del paseo">
          <h2 className="owalks__card-title">Progreso</h2>
          <ol className="owalks__steps">
            {progressSteps(detail).map((step) => (
              <li key={step.label} data-done={step.done} data-current={step.current}>
                <span className="owalks__step-dot" aria-hidden="true" />
                <span className="owalks__step-label">{step.label}</span>
                {step.at !== null ? <span className="owalks__step-time">{formatHourBogota(step.at)}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      )}

      {canTrack ? (
        <section className="glass owalks__card" aria-label="En vivo">
          <div className="owalks__card-head">
            <h2 className="owalks__card-title">
              <span className="owalks__live-badge"><span className="owalks__live-dot" aria-hidden="true" /> EN VIVO</span>
            </h2>
            <span className="owalks__muted" role="status">
              {live?.position ? `${live.minutesElapsed} de ${minutes} min` : "Esperando la primera ubicación…"}
            </span>
          </div>
          <div className="owalks__bar" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
          <MarkersMap label="Mapa en vivo" markers={liveMarkers} />
        </section>
      ) : null}

      {report !== null ? (
        <section className="glass owalks__card" aria-label="Reporte">
          <h2 className="owalks__card-title">📸 Reporte del paseo</h2>
          <dl className="owalks__metrics">
            <div><dt>Distancia</dt><dd>{kmLabel(report.distanceKm)}</dd></div>
            <div><dt>Tiempo</dt><dd>{minutesLabel(report.durationMin)}</dd></div>
            <div><dt>Ritmo</dt><dd>{pace !== null ? `${pace.toFixed(0)} min/km` : "—"}</dd></div>
          </dl>
          {report.status === "ok" && report.text !== null ? <p className="owalks__report-text">{report.text}</p> : null}
          {allowed.has("replay") && replay === null ? (
            <button type="button" className="explore__small" disabled={isBusy} onClick={() => void showReplay()}>
              🗺 Ver recorrido
            </button>
          ) : null}
          {replay !== null ? <MarkersMap label="Recorrido" markers={replay} connect /> : null}
        </section>
      ) : allowed.has("replay") ? (
        <section className="glass owalks__card" aria-label="Recorrido">
          {replay === null ? (
            <button type="button" className="explore__small" disabled={isBusy} onClick={() => void showReplay()}>🗺 Ver recorrido</button>
          ) : (
            <MarkersMap label="Recorrido" markers={replay} connect />
          )}
        </section>
      ) : null}

      {allowed.has("rate") || detail.rating !== null ? (
        <section className="glass owalks__card owalks__rate" aria-label="Calificar">
          <h2 className="owalks__card-title">
            {detail.rating !== null ? `Calificaste a ${walkerName}` : `¿Cómo le fue a ${detail.dog.name} con ${walkerName}?`}
          </h2>
          {allowed.has("rate") ? (
            <div className="owalks__star-input" role="group" aria-label="Calificar" onMouseLeave={() => setHoverStar(0)}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={isBusy}
                  data-on={value <= shownRating}
                  aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
                  onMouseEnter={() => setHoverStar(value)}
                  onFocus={() => setHoverStar(value)}
                  onBlur={() => setHoverStar(0)}
                  onClick={() => void act(() => rateWalk(walkId, value), "¡Gracias por calificar!", "rate")}
                >
                  ★
                </button>
              ))}
            </div>
          ) : (
            <Stars value={detail.rating ?? 0} size="lg" />
          )}
        </section>
      ) : null}

      {allowed.has("repeat") || allowed.has("cancel") || allowed.has("no_show") ? (
        <section className="glass owalks__card owalks__actions" aria-label="Acciones">
          {allowed.has("repeat") ? (
            repeatAt === null ? (
              <button type="button" className="explore__cta" onClick={() => setRepeatAt("")}>🔁 Repetir este paseo</button>
            ) : (
              <div className="explore__field owalks__repeat">
                <label className="explore__label" htmlFor="repeat-when">¿Cuándo lo repetimos?</label>
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
                <button type="button" className="explore__small" onClick={() => setRepeatAt(null)}>Cancelar</button>
              </div>
            )
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
          {allowed.has("cancel") ? (
            confirmCancel ? (
              <div className="owalks__confirm" role="group" aria-label="Confirmar cancelación">
                <p>¿Seguro que quieres cancelar el paseo de {detail.dog.name}?</p>
                <div className="owalks__confirm-actions">
                  <button
                    type="button"
                    className="explore__small explore__small--no"
                    disabled={isBusy}
                    onClick={() => void act(() => cancelWalk(walkId), "Cancelaste el paseo.", "cancel")}
                  >
                    Sí, cancelar
                  </button>
                  <button type="button" className="explore__small" onClick={() => setConfirmCancel(false)}>No</button>
                </div>
              </div>
            ) : (
              <button type="button" className="explore__small explore__small--no" disabled={isBusy} onClick={() => setConfirmCancel(true)}>
                Cancelar paseo
              </button>
            )
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function WalkCard({ walk, now, onOpen }: { walk: WalkItem; now: Date; onOpen: () => void }) {
  const dog = walk.dogName ?? "Tu perro";
  const stale = isStale(walk, now);
  const past = walk.status === "done" || walk.status === "cancelled" || walk.status === "expired";
  return (
    <li>
      <button type="button" className="glass owalks__walk" data-status={walk.status} onClick={onOpen} aria-label={`Abrir paseo de ${dog}`}>
        <span className="owalks__avatar" aria-hidden="true">{dog.slice(0, 1).toUpperCase()}</span>
        <span className="owalks__walk-main">
          <span className="owalks__walk-top">
            <strong>{dog}</strong>
            <StatusChip status={walk.status} stale={stale} />
          </span>
          <span className="owalks__walk-meta">
            {formatHourBogota(walk.requestedTime)} · {minutesLabel(Math.round(walk.durationHours * 60))} · {walk.walkerName ?? "Sin paseador"}
          </span>
          {past && walk.status === "done" ? (
            <span className="owalks__walk-extra">
              {walk.distanceKm != null ? <span>🐾 {kmLabel(walk.distanceKm)}</span> : null}
              {walk.durationMin != null ? <span>⏱ {minutesLabel(walk.durationMin)}</span> : null}
              {walk.hasReport ? <span className="owalks__tag">📸 Reporte listo</span> : null}
              {walk.rating != null ? <Stars value={walk.rating} /> : null}
              {walk.canRate ? <span className="owalks__tag owalks__tag--lime">★ Calificar</span> : null}
            </span>
          ) : null}
        </span>
        <span className="owalks__walk-price">{formatCop(walk.priceCop)}</span>
      </button>
    </li>
  );
}

export type OwnerWalksScreenProps = {
  userId: string;
  /** A walk was repeated: its new open request waits in Explorar. */
  onRepeated?: () => void;
  /** Jump to another tab (Explorar for "Pedir un paseo"). */
  onGo?: (tab: string) => void;
};

/** Mis paseos (owner): month summary, the walk that matters now, tabs by day, and the detail. */
export function OwnerWalksScreen({ userId, onRepeated = () => undefined, onGo }: OwnerWalksScreenProps) {
  const [tab, setTab] = useState<WalkTab>("upcoming");
  const [items, setItems] = useState<WalkItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [summary, setSummary] = useState<WalkSummary | null>(null);
  const [featured, setFeatured] = useState<WalkItem | null>(null);
  const [dogFilter, setDogFilter] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

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
  }, [load, refresh]);

  // Header: month totals, tab counters and the walk that matters right now.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const next = await fetchWalkSummary(userId);
        if (!alive) return;
        setSummary(next);
        const pick = next.counts.active > 0 ? "active" : next.counts.upcoming > 0 ? "upcoming" : null;
        if (pick === null) {
          setFeatured(null);
          return;
        }
        const page = await fetchOwnerWalks(userId, pick);
        if (alive) setFeatured(page.items[0] ?? null);
      } catch {
        // The header is a bonus; the list below still shows its own error.
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, refresh]);

  const dogs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const walk of items) {
      if (!seen.has(walk.dogId)) seen.set(walk.dogId, walk.dogName ?? "Tu perro");
    }
    return [...seen.entries()];
  }, [items]);

  const now = new Date();
  const visible = dogFilter === null ? items : items.filter((walk) => walk.dogId === dogFilter);
  const groups: { day: string; walks: WalkItem[] }[] = [];
  for (const walk of visible) {
    const day = dayHeading(walk.requestedTime, now);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.day === day) last.walks.push(walk);
    else groups.push({ day, walks: [walk] });
  }

  if (openId !== null) {
    return (
      <WalkDetailView
        walkId={openId}
        onBack={() => setOpenId(null)}
        onRepeated={onRepeated}
        onChanged={() => setRefresh((n) => n + 1)}
      />
    );
  }

  const month = summary?.month;
  const featuredLive = featured?.status === "in_walk";

  return (
    <div className="explore oglass owalks">
      <header className="explore__head owalks__head">
        <h1 className="explore__title">Mis paseos</h1>
        <p className="explore__subtitle">
          {month === undefined
            ? "Todos los paseos de tus peludos"
            : month.walks === 0
              ? "Este mes aún no hay paseos terminados"
              : `Este mes: ${month.walks} ${month.walks === 1 ? "paseo" : "paseos"} · ${kmLabel(month.km)} · ${minutesLabel(month.minutes)} al aire libre`}
        </p>
      </header>

      {featured !== null ? (
        <button type="button" className="glass owalks__feature" onClick={() => setOpenId(featured.id)}>
          <span className="owalks__feature-text">
            <span className="owalks__feature-label">
              {featuredLive ? (
                <span className="owalks__live-badge"><span className="owalks__live-dot" aria-hidden="true" /> EN VIVO</span>
              ) : isStale(featured, now) ? (
                "PENDIENTE DE INICIAR"
              ) : (
                "PRÓXIMO PASEO"
              )}
            </span>
            <span className="owalks__feature-title">{featured.dogName ?? "Tu perro"}</span>
            <span className="owalks__feature-sub">
              {featuredLive
                ? `Paseando con ${featured.walkerName ?? "su paseador"}`
                : `${capitalize(countdown(featured.requestedTime, now))} · con ${featured.walkerName ?? "tu paseador"}`}
            </span>
            <span className="owalks__facts">
              <span>⏱ {minutesLabel(Math.round(featured.durationHours * 60))}</span>
              <span>💵 {formatCop(featured.priceCop)}</span>
            </span>
            <span className="owalks__feature-cta">{featuredLive ? "Ver en vivo →" : "Ver detalle →"}</span>
          </span>
          <img className="owalks__hero-art" src="/art/characters/dog-sit.webp" alt="" draggable={false} />
        </button>
      ) : null}

      <div className="glass owalks__tabs" role="tablist" aria-label="Estado de los paseos">
        {TABS.map((option) => {
          const count = summary?.counts[option.id];
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={tab === option.id}
              className="owalks__tab"
              onClick={() => {
                setTab(option.id);
                setDogFilter(null);
              }}
            >
              {option.label}
              {count !== undefined && count > 0 ? <span className="owalks__count">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {dogs.length > 1 ? (
        <div className="owalks__dogs" role="group" aria-label="Filtrar por perro">
          <button type="button" className="owalks__dog" aria-pressed={dogFilter === null} onClick={() => setDogFilter(null)}>
            Todos
          </button>
          {dogs.map(([id, name]) => (
            <button key={id} type="button" className="owalks__dog" aria-pressed={dogFilter === id} onClick={() => setDogFilter(id)}>
              <span className="owalks__dog-initial" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
              {name}
            </button>
          ))}
        </div>
      ) : null}

      {isLoading ? <DogLoader label="Cargando tus paseos…" pose="walk" /> : null}
      {error !== null ? (
        <div className="glass oglass__retry">
          <p className="explore__error" role="alert">{error}</p>
          <button type="button" className="explore__small explore__small--lime" onClick={() => setRefresh((n) => n + 1)}>Reintentar</button>
        </div>
      ) : null}

      {!isLoading && error === null && visible.length === 0 ? (
        <div className="glass owalks__empty">
          <MascotSprite pose="wait" size={120} />
          <p>{EMPTY_TEXT[tab]}</p>
          {tab !== "past" ? (
            <button type="button" className="explore__small explore__small--lime" onClick={() => onGo?.("explore")}>
              Pedir un paseo
            </button>
          ) : null}
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.day} className="owalks__group" aria-label={group.day}>
          <h2 className="owalks__day">{group.day}</h2>
          <ul className="owalks__list">
            {group.walks.map((walk) => (
              <WalkCard key={walk.id} walk={walk} now={now} onOpen={() => setOpenId(walk.id)} />
            ))}
          </ul>
        </section>
      ))}

      {nextCursor !== null ? (
        <button type="button" className="explore__small owalks__more" onClick={() => void load(nextCursor)}>
          Ver más paseos
        </button>
      ) : null}
    </div>
  );
}
