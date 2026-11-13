import { useEffect, useRef } from "react";
import { ClockIcon, PinIcon, WalletIcon } from "../auth/icons.js";
import { CityScene } from "../city/CityScene.js";
import { translateApiError } from "../lib/errors.js";
import { formatCop, formatHourBogota, formatWhenBogota } from "../lib/format.js";
import {
  fetchWalkerHome,
  type WalkerHome as WalkerHomeData,
  type WalkerHomeWalk,
  type WalkerNearbyCard,
} from "../lib/marketplace.js";
import { statusOf, useFetched } from "../lib/useFetched.js";
import { DogLoader } from "../ui/DogLoader.js";
import { MascotSprite } from "../mascot/MascotSprite.js";
import { PawLineIcon } from "./icons.js";
import { WeatherCard } from "./OwnerHome.js";
import { EarningsCard } from "./EarningsCard.js";
import { PREVIEW_WALKER_HOME } from "./previewData.js";
import { useWalkerPresence } from "../walker/presence.js";
import "./walker-home.css";

const ACTIVE_POLL_MS = 20_000;
export { HEARTBEAT_MS } from "../walker/presence.js";

function minutes(hours: number): string {
  return `${Math.round(hours * 60)} min`;
}

/** "en 2 h 15 min" / "en 40 min" until a future instant; null when it already passed. */
function startsIn(iso: string, now: number): string | null {
  const diff = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (Number.isNaN(diff) || diff < 0) {
    return null;
  }
  if (diff < 60) {
    return `en ${diff} min`;
  }
  if (diff < 24 * 60) {
    const rest = diff % 60;
    return `en ${Math.floor(diff / 60)} h${rest > 0 ? ` ${rest} min` : ""}`;
  }
  return null;
}

function km(value: number): string {
  return `a ${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })} km`;
}

type TicketKind = "live" | "next" | "stale";

const TICKET_LABEL: Record<TicketKind, string> = {
  live: "Paseo en curso",
  next: "Próximo paseo",
  stale: "Pendiente de iniciar",
};

function WalkTicket({
  walk,
  kind,
  onRoutes,
}: {
  walk: WalkerHomeWalk;
  kind: TicketKind;
  onRoutes: () => void;
}) {
  const label = TICKET_LABEL[kind];
  const soon = kind === "next" ? startsIn(walk.requestedTime, Date.now()) : null;
  const sub =
    kind === "live"
      ? `desde ${formatHourBogota(walk.requestedTime)}`
      : kind === "stale"
        ? `Era para el ${formatWhenBogota(walk.requestedTime)}`
        : (soon ?? formatWhenBogota(walk.requestedTime));

  return (
    <section className="glass home__ticket whome__ticket" data-kind={kind} aria-label={label}>
      <div className="home__ticket-main">
        <p className="whome__tag" data-kind={kind}>
          {kind === "live" ? <span className="whome__dot" aria-hidden="true" /> : null}
          {label}
        </p>
        <p className="home__ticket-title">
          {kind === "live" ? `Paseando a ${walk.dogName ?? "un perro"}` : (walk.dogName ?? "Un perro")}
        </p>
        <p className="home__ticket-sub">
          {sub} · {walk.ownerName ?? "Dueño"}
        </p>
        <ul className="home__chips">
          <li><ClockIcon />{minutes(walk.durationHours)}</li>
          <li><WalletIcon />{formatCop(walk.priceCop)}</li>
        </ul>
        {kind === "stale" ? (
          <p className="whome__muted">Inícialo o cancélalo desde Rutas para liberar tu agenda.</p>
        ) : null}
        <button type="button" className="whome__ghost" onClick={onRoutes}>
          {kind === "stale" ? "Ver en Rutas" : "Ver ruta"}
        </button>
      </div>
      <img className="home__ticket-art" src="/art/characters/walker-thumbs.webp" alt="" draggable={false} />
    </section>
  );
}

function NearbySection({
  online,
  count,
  cards,
  onOpen,
}: {
  online: boolean;
  count: number;
  cards: WalkerNearbyCard[];
  onOpen: () => void;
}) {
  return (
    <section className="glass whome__card whome__nearby" aria-label="Solicitudes cerca">
      <div className="whome__card-head">
        <h2 className="whome__card-title">Solicitudes cerca</h2>
        {online && count > 0 ? <span className="whome__count">{count}</span> : null}
      </div>
      {!online ? (
        <p className="whome__muted">Conéctate para ver solicitudes cerca de ti.</p>
      ) : count === 0 ? (
        <div className="whome__empty">
          <MascotSprite pose="wait" size={72} />
          <p className="whome__muted">Nadie pide paseo cerca por ahora. Te avisamos aquí.</p>
        </div>
      ) : (
        <>
          <ul className="whome__requests">
            {cards.map((card) => (
              <li key={card.id} className="whome__request">
                <span className="whome__avatar" aria-hidden="true">
                  {(card.dogName ?? "?").charAt(0).toUpperCase()}
                </span>
                <span className="whome__request-main">
                  <strong>{card.dogName ?? "Un perro"}</strong>
                  <span>{minutes(card.durationHours)} · {formatWhenBogota(card.requestedTime)}</span>
                  <span className="whome__request-chips">
                    <span><PinIcon />{km(card.distanceKm)}</span>
                    {card.offered ? <span className="whome__sent">Ya ofertaste</span> : null}
                  </span>
                </span>
                <strong className="whome__price">{formatCop(card.priceCop)}</strong>
              </li>
            ))}
          </ul>
          <button type="button" className="whome__primary" onClick={onOpen}>
            Ver todas ({count})
          </button>
        </>
      )}
    </section>
  );
}

export type WalkerHomeProps = {
  userId: string;
  preview?: boolean;
  onNavigate: (screen: "requests" | "routes") => void;
};

/** Walker Inicio: the online switch, the next walk, nearby requests, today and Ganancias. */
export function WalkerHome({ userId, preview = false, onNavigate }: WalkerHomeProps) {
  const home = useFetched<WalkerHomeData>(
    () => (preview ? Promise.resolve(PREVIEW_WALKER_HOME) : fetchWalkerHome(userId)),
    [userId, preview],
    { pollMs: ACTIVE_POLL_MS, shouldPoll: (data) => data?.activeWalk !== null && data?.activeWalk !== undefined },
  );
  const presence = useWalkerPresence();
  const data = home.data;
  const isOnline = presence.online ?? data?.online ?? false;
  const { error: switchError, cooldown, busy, toggle, sync } = presence;

  // The server is the truth for `online`: adopt it whenever /home answers.
  useEffect(() => {
    if (data !== null) {
      sync(data.online);
    }
  }, [data, sync]);

  // After a sleep of more than 2 minutes the server may have flipped us offline: read it again.
  const { reload } = home;
  useEffect(() => {
    if (preview) {
      return;
    }
    function onVisible() {
      if (document.visibilityState === "visible") {
        reload();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [preview, reload]);

  // The switch changed (here or on another tab): refresh the nearby count.
  const lastOnline = useRef(presence.online);
  useEffect(() => {
    if (lastOnline.current !== null && presence.online !== null && lastOnline.current !== presence.online) {
      reload();
    }
    lastOnline.current = presence.online;
  }, [presence.online, reload]);

  const unauthorized = statusOf(home.error) === 401;
  const nearbyCount = isOnline ? (data?.openNearby ?? 0) : 0;
  const ticket =
    data === null
      ? null
      : data.activeWalk !== null
        ? { walk: data.activeWalk, kind: "live" as const }
        : data.nextWalk !== null
          ? { walk: data.nextWalk, kind: data.nextWalk.stale === true ? ("stale" as const) : ("next" as const) }
          : null;

  return (
    <main className="home__grid whome" data-offline={!isOnline ? "" : undefined}>
      <header className="home__greeting">
        <h1 className="home__title">Hola, {data?.greetingName ?? "paseador"}</h1>
        <p className="home__subtitle">
          {isOnline ? "Estás en línea · recibiendo solicitudes" : "Conéctate para empezar a ganar"}
        </p>
      </header>

      <section className="glass whome__status" data-online={isOnline ? "" : undefined} aria-label="Estado">
        <span className="whome__status-dot" aria-hidden="true" />
        <div className="whome__status-text">
          <p className="whome__status-title">{isOnline ? "En línea" : "Estás desconectado"}</p>
          <p className="whome__status-sub">
            {isOnline
              ? nearbyCount === 0
                ? "Esperando solicitudes cerca de ti"
                : `${nearbyCount} ${nearbyCount === 1 ? "solicitud" : "solicitudes"} cerca de ti`
              : "Los dueños no te ven hasta que te conectes"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isOnline}
          aria-label="En línea"
          className="whome__switch"
          disabled={home.isLoading || cooldown || busy}
          onClick={() => void toggle()}
        >
          {isOnline ? "Desconectarme" : "Conectarme"}
        </button>
        {switchError !== null ? <p className="whome__warn" role="alert">{switchError}</p> : null}
      </section>

      {home.isStale ? <p className="whome__warn whome__wide" role="status">Sin conexión</p> : null}
      {unauthorized ? <p className="whome__warn whome__wide" role="alert">Tu sesión venció. Vuelve a ingresar.</p> : null}

      {home.isLoading ? (
        <section className="glass home__ticket whome__ticket" aria-label="Cargando">
          <div className="home__card-loader"><DogLoader label="Cargando tu panel…" /></div>
        </section>
      ) : null}

      {!home.isLoading && data === null && !unauthorized ? (
        <section className="glass whome__card whome__ticket" role="alert">
          <p className="whome__muted">{translateApiError(home.error, "No pudimos cargar tu panel.")}</p>
          <button type="button" className="whome__primary" onClick={home.reload}>Reintentar</button>
        </section>
      ) : null}

      {ticket !== null ? (
        <WalkTicket walk={ticket.walk} kind={ticket.kind} onRoutes={() => onNavigate("routes")} />
      ) : null}
      {data !== null && ticket === null ? (
        <section className="glass whome__card whome__ticket" aria-label="Agenda">
          <div className="whome__empty">
            <MascotSprite pose="wait" size={72} />
            <p className="whome__muted">Aún no tienes paseos agendados. Oferta en una solicitud para empezar.</p>
          </div>
        </section>
      ) : null}

      {data !== null ? (
        <NearbySection
          online={isOnline}
          count={nearbyCount}
          cards={data.nearby ?? []}
          onOpen={() => onNavigate("requests")}
        />
      ) : null}

      {data !== null ? (
        <section className="glass whome__card whome__today" aria-label="Hoy">
          <h2 className="whome__card-title">Hoy</h2>
          <ul className="whome__stats">
            <li>
              <PawLineIcon />
              <strong>{data.today.walks}</strong>
              <span>{data.today.walks === 1 ? "paseo" : "paseos"}</span>
            </li>
            <li>
              <WalletIcon />
              <strong>{formatCop(data.today.netCop)}</strong>
              <span>netos</span>
            </li>
            <li>
              <span className="whome__star" aria-hidden="true">★</span>
              <strong>
                {data.rating.average === null
                  ? "Nuevo"
                  : data.rating.average.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </strong>
              <span>
                {data.rating.average === null
                  ? "sin calificaciones"
                  : `${data.rating.count} ${data.rating.count === 1 ? "calificación" : "calificaciones"}`}
              </span>
            </li>
          </ul>
          {data.today.walks === 0 ? (
            <p className="whome__muted">Aún no hay paseos hoy.</p>
          ) : (
            <p className="whome__muted">Comisión simulada 10%: {formatCop(data.today.commissionCop)}</p>
          )}
        </section>
      ) : null}

      <EarningsCard walkerId={userId} preview={preview} onRequests={() => onNavigate("requests")} />

      {data !== null && data.pendingOffers > 0 ? (
        <section className="glass whome__card whome__offers" aria-label="Ofertas pendientes">
          <p className="whome__offers-line">
            <PawLineIcon />
            <span>
              {data.pendingOffers} {data.pendingOffers === 1 ? "oferta espera" : "ofertas esperan"} respuesta del dueño
            </span>
          </p>
          <button type="button" className="whome__ghost" onClick={() => onNavigate("requests")}>
            Ver mis ofertas
          </button>
        </section>
      ) : null}

      <WeatherCard preview={preview} />

      <div className="home__city whome__city">
        <CityScene />
      </div>
    </main>
  );
}
