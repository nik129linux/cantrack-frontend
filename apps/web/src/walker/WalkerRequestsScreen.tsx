import { useCallback, useEffect, useRef, useState } from "react";
import { ClockIcon, PinIcon } from "../auth/icons.js";
import { MinusIcon, PlusIcon } from "../home/icons.js";
import { ApiError } from "../lib/apiError.js";
import { formatCop, formatWhenBogota } from "../lib/format.js";
import {
  etaMinutes,
  fetchMyOffers,
  fetchOpenRequests,
  sendOffer,
  withdrawOffer,
  type MyOffer,
  type RequestCard,
} from "../lib/marketplace.js";
import { MarkersMap } from "../map/MarkersMap.js";
import { MascotSprite } from "../mascot/MascotSprite.js";
import { DogLoader } from "../ui/DogLoader.js";
import { OnlinePill } from "./OnlinePill.js";
import { useWalkerPresence } from "./presence.js";
import "./walker-glass.css";
import "./walker-requests.css";

/** The inbox refreshes every 10 s while the screen is open. */
export const INBOX_POLL_MS = 10_000;
const STEP_COP = 1000;
const MIN_COUNTER_COP = 8000;
/** Owners get offers for 10 minutes; the ring empties over that window. */
const OFFER_WINDOW_S = 10 * 60;
const QUICK_RAISES = [1000, 2000, 3000];

/** The Spanish copy for the statuses the offer endpoints answer. */
export function offerError(error: unknown, fallback = "No pudimos enviar tu oferta."): string {
  if (error instanceof ApiError) {
    const text = error.message;
    if (error.status >= 500) {
      return error.errorId !== null
        ? `Algo falló de nuestro lado. Código: ${error.errorId}`
        : "Algo falló de nuestro lado.";
    }
    if (error.status === 429) {
      return "Espera un momento";
    }
    if (error.status === 409 && /go online/i.test(text)) {
      return "Conéctate para ofertar";
    }
    if (error.status === 409 && /already offered/i.test(text)) {
      return "Ya enviaste una oferta; actualizamos la tarjeta";
    }
    if (error.status === 409 && /no longer open/i.test(text)) {
      return "El dueño ya eligió";
    }
    if (error.status === 403) {
      return "Esta solicitud ya no está disponible";
    }
    if (error.status === 404) {
      return "No tienes una oferta en esta solicitud";
    }
  }
  return fallback;
}

function km(value: number): string {
  return `a ${value.toFixed(1).replace(".", ",")} km`;
}

function useSecondsLeft(deadlineAt: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return Math.max(0, Math.floor((new Date(deadlineAt).getTime() - now) / 1000));
}

/** The dog's initial inside a ring that empties as the offer window closes. */
function CountdownAvatar({ name, seconds }: { name: string; seconds: number }) {
  const radius = 26;
  const length = 2 * Math.PI * radius;
  const ratio = Math.min(1, seconds / OFFER_WINDOW_S);
  const urgent = seconds < 60;
  return (
    <span className="wreq__ring" data-urgent={urgent ? "" : undefined} aria-hidden="true">
      <svg viewBox="0 0 60 60">
        <circle cx="30" cy="30" r={radius} className="wreq__ring-track" />
        <circle
          cx="30"
          cy="30"
          r={radius}
          className="wreq__ring-fill"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - ratio)}
          transform="rotate(-90 30 30)"
        />
      </svg>
      <span className="wreq__ring-initial">{name.charAt(0).toUpperCase()}</span>
    </span>
  );
}

type CardProps = {
  card: RequestCard;
  onChanged: () => void;
  onDrop: (id: string) => void;
  onGoHome: () => void;
};

function InboxCard({ card, onChanged, onDrop, onGoHome }: CardProps) {
  const [counter, setCounter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsOnline, setNeedsOnline] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const { position } = useWalkerPresence();
  const seconds = useSecondsLeft(card.deadlineAt);
  const eta = etaMinutes(card.distanceKm);
  const maxCounter = card.fareCop * 2;
  const minCounter = Math.max(MIN_COUNTER_COP, STEP_COP);
  const dogName = card.dogName ?? "Un perro";
  const dropped = useRef(false);

  // The owner stops taking offers at the deadline: the card leaves by itself.
  useEffect(() => {
    if (seconds === 0 && card.myOffer === null && !dropped.current) {
      dropped.current = true;
      onDrop(card.id);
    }
  }, [seconds, card.id, card.myOffer, onDrop]);

  async function run(action: () => Promise<unknown>) {
    setIsBusy(true);
    setError(null);
    setNeedsOnline(false);
    try {
      await action();
      setCounter(null);
      onChanged();
    } catch (failure: unknown) {
      setError(offerError(failure));
      if (failure instanceof ApiError) {
        if (failure.status === 403) {
          onDrop(card.id);
        } else if (failure.status === 409 && /go online/i.test(failure.message)) {
          setNeedsOnline(true);
        } else if (failure.status === 409 || failure.status === 404) {
          onChanged();
        }
      }
    } finally {
      setIsBusy(false);
    }
  }

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <li className="glass wreq__card wg__rise" data-status={card.myOffer ? "offered" : "open"}>
      <div className="wreq__top">
        <CountdownAvatar name={dogName} seconds={seconds} />
        <div className="wreq__main">
          <strong className="wreq__dog">{dogName}</strong>
          <span className="wreq__owner">{card.ownerName ?? "Dueño"}</span>
          <ul className="wg__chips">
            <li className="wg__chip"><ClockIcon />{Math.round(card.durationHours * 60)} min</li>
            <li className="wg__chip"><PinIcon />{km(card.distanceKm)}</li>
            <li className="wg__chip">{formatWhenBogota(card.requestedTime)}</li>
          </ul>
        </div>
        <div className="wreq__fare">
          <strong>{formatCop(card.fareCop)}</strong>
          <span className="wreq__clock" data-urgent={seconds < 60 ? "" : undefined}>Cierra en {clock}</span>
        </div>
      </div>

      <button
        type="button"
        className="wreq__map-toggle"
        aria-expanded={showMap}
        onClick={() => setShowMap((open) => !open)}
      >
        {showMap ? "Ocultar mapa" : "Ver en el mapa"}
      </button>
      {showMap ? (
        <div className="wreq__map">
          <MarkersMap
            label={`Recogida de ${dogName}`}
            connect={position !== null}
            markers={[
              ...(position !== null ? [{ id: "me", lat: position.lat, lng: position.lng, label: "Tú", kind: "me" as const }] : []),
              { id: card.id, lat: card.pickupLat, lng: card.pickupLng, label: `Recogida · ${dogName}`, kind: "next" as const },
            ]}
          />
        </div>
      ) : null}

      {error !== null ? <p className="wg__warn" role="alert">{error}</p> : null}
      {needsOnline ? (
        <button type="button" className="wg__primary" onClick={onGoHome}>
          Ir a Inicio y conectarme
        </button>
      ) : null}

      {card.myOffer !== null ? (
        <div className="wreq__sent">
          <span className="wg__chip" data-tone="lime">Oferta enviada · {formatCop(card.myOffer.priceCop)}</span>
          <span className="wg__muted">Esperando al dueño</span>
          <button
            type="button"
            className="wg__ghost"
            disabled={isBusy}
            onClick={() => void run(() => withdrawOffer(card.id))}
          >
            Retirar
          </button>
        </div>
      ) : counter === null ? (
        <div className="wreq__actions">
          <button
            type="button"
            className="wg__primary"
            disabled={isBusy}
            onClick={() => void run(() => sendOffer(card.id, { kind: "accept", etaMin: eta }))}
          >
            Aceptar {formatCop(card.fareCop)}
          </button>
          <button
            type="button"
            className="wg__ghost"
            disabled={isBusy}
            onClick={() => setCounter(Math.min(maxCounter, card.fareCop + STEP_COP))}
          >
            Contraofertar
          </button>
        </div>
      ) : (
        <div className="wreq__counter">
          <div className="wreq__stepper">
            <button
              type="button"
              className="wg__round"
              aria-label="Bajar contraoferta"
              disabled={counter - STEP_COP < minCounter}
              onClick={() => setCounter(counter - STEP_COP)}
            >
              <MinusIcon />
            </button>
            <span className="wreq__counter-value" aria-live="polite">{formatCop(counter)}</span>
            <button
              type="button"
              className="wg__round"
              aria-label="Subir contraoferta"
              disabled={counter + STEP_COP > maxCounter}
              onClick={() => setCounter(counter + STEP_COP)}
            >
              <PlusIcon />
            </button>
          </div>
          <div className="wg__filters" role="group" aria-label="Subidas rápidas">
            {QUICK_RAISES.filter((raise) => card.fareCop + raise <= maxCounter).map((raise) => (
              <button
                key={raise}
                type="button"
                className="wg__filter"
                aria-pressed={counter === card.fareCop + raise}
                onClick={() => setCounter(card.fareCop + raise)}
              >
                +{formatCop(raise)}
              </button>
            ))}
          </div>
          <div className="wreq__actions">
            <button
              type="button"
              className="wg__primary"
              disabled={isBusy}
              onClick={() => void run(() => sendOffer(card.id, { kind: "counter", priceCop: counter, etaMin: eta }))}
            >
              Enviar contraoferta
            </button>
            <button type="button" className="wg__ghost" onClick={() => setCounter(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

const OFFER_CHIP: Record<MyOffer["status"], string> = {
  pending: "Esperando al dueño",
  won: "¡Ganaste!",
  lost: "No elegida",
};

const OFFER_TONE: Record<MyOffer["status"], "amber" | "lime" | "muted"> = {
  pending: "amber",
  won: "lime",
  lost: "muted",
};

function MyOffers({ walkerId, onGoRoutes }: { walkerId: string; onGoRoutes: () => void }) {
  const [offers, setOffers] = useState<MyOffer[] | null>(null);
  const [status, setStatus] = useState<MyOffer["status"] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setOffers(null);
    setError(null);
    fetchMyOffers(walkerId, status)
      .then((loaded) => isMounted && setOffers(loaded))
      .catch((failure: unknown) => isMounted && setError(offerError(failure, "No pudimos cargar tus ofertas.")));
    return () => {
      isMounted = false;
    };
  }, [walkerId, status, attempt]);

  // While an owner is still deciding, check again every 10 s so a win shows up live.
  const waiting = (offers ?? []).some((offer) => offer.status === "pending");
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const id = window.setInterval(() => {
      fetchMyOffers(walkerId, status)
        .then(setOffers)
        .catch(() => undefined);
    }, INBOX_POLL_MS);
    return () => window.clearInterval(id);
  }, [waiting, walkerId, status]);

  return (
    <section className="wreq__offers" aria-label="Mis ofertas">
      <div className="wg__filters" role="group" aria-label="Filtro de ofertas">
        <button type="button" className="wg__filter" aria-pressed={status === undefined} onClick={() => setStatus(undefined)}>
          Todas
        </button>
        {(["pending", "won", "lost"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className="wg__filter"
            aria-pressed={status === option}
            onClick={() => setStatus(option)}
          >
            {OFFER_CHIP[option]}
          </button>
        ))}
      </div>
      {error !== null ? (
        <div className="glass wg__card" role="alert">
          <p className="wg__muted">{error}</p>
          <button type="button" className="wg__primary" onClick={() => setAttempt((n) => n + 1)}>Reintentar</button>
        </div>
      ) : null}
      {offers === null && error === null ? <DogLoader label="Cargando tus ofertas…" /> : null}
      {offers !== null && offers.length === 0 ? (
        <div className="glass wg__empty">
          <MascotSprite pose="wait" size={96} />
          <p>Aún no tienes ofertas. Acepta o contraoferta una solicitud cercana.</p>
        </div>
      ) : null}
      <ul className="wg__list">
        {(offers ?? []).map((offer) => (
          <li key={offer.offerId} className="glass wreq__offer wg__rise" data-status={offer.status}>
            <span className="wg__avatar" aria-hidden="true">{(offer.dogName ?? "?").charAt(0).toUpperCase()}</span>
            <div className="wreq__main">
              <strong className="wreq__dog">{offer.dogName ?? "Un perro"} · {formatCop(offer.priceCop)}</strong>
              <span className="wreq__owner">{formatWhenBogota(offer.requestedTime)} · tarifa {formatCop(offer.fareCop)}</span>
              <ul className="wg__chips">
                <li className="wg__chip" data-tone={OFFER_TONE[offer.status]}>{OFFER_CHIP[offer.status]}</li>
                <li className="wg__chip">{offer.kind === "accept" ? "Aceptaste la tarifa" : "Contraoferta"}</li>
              </ul>
            </div>
            {offer.status === "won" ? (
              <button type="button" className="wg__primary" onClick={onGoRoutes}>
                Ver en Rutas
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export type WalkerRequestsScreenProps = {
  userId: string;
  onGoHome?: () => void;
  onGoRoutes?: () => void;
};

/** Solicitudes (walker, inDrive style): accept the owner's fare in one tap or counter-offer. */
export function WalkerRequestsScreen({ userId, onGoHome = () => undefined, onGoRoutes = () => undefined }: WalkerRequestsScreenProps) {
  const [tab, setTab] = useState<"inbox" | "mine">("inbox");
  const [cards, setCards] = useState<RequestCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [won, setWon] = useState<string | null>(null);
  const presence = useWalkerPresence();
  const offeredIds = useRef<Set<string>>(new Set());
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await fetchOpenRequests();
      setCards(next);
      setError(null);
      // A request I offered on left the inbox: the owner picked someone. Was it me?
      const stillOpen = new Set(next.map((card) => card.id));
      const gone = [...offeredIds.current].filter((id) => !stillOpen.has(id));
      offeredIds.current = new Set(next.filter((card) => card.myOffer !== null).map((card) => card.id));
      if (gone.length > 0) {
        fetchMyOffers(userId, "won")
          .then((wins) => {
            const win = wins.find((offer) => gone.includes(offer.requestId));
            if (win !== undefined) {
              setWon(win.dogName ?? "un perro");
            }
          })
          .catch(() => undefined);
      }
    } catch (failure: unknown) {
      // A hiccup on a background refresh keeps the cards already on screen.
      if (!loadedOnce.current) {
        setError(offerError(failure, "No pudimos cargar las solicitudes."));
      }
      return;
    }
    loadedOnce.current = true;
  }, [userId]);

  useEffect(() => {
    if (tab !== "inbox") {
      return;
    }
    void load();
    const id = window.setInterval(() => void load(), INBOX_POLL_MS);
    return () => window.clearInterval(id);
  }, [tab, load]);

  // Coming back online: look for requests right away instead of waiting 10 s.
  const lastOnline = useRef(presence.online);
  useEffect(() => {
    if (lastOnline.current === false && presence.online === true) {
      void load();
    }
    lastOnline.current = presence.online;
  }, [presence.online, load]);

  const drop = useCallback((id: string) => {
    setCards((current) => current?.filter((item) => item.id !== id) ?? current);
  }, []);

  const pending = (cards ?? []).filter((card) => card.myOffer !== null).length;
  const offline = presence.online === false;

  return (
    <div className="wglass wreq">
      <header className="wg__head">
        <div>
          <h1 className="wg__title">Solicitudes</h1>
          <p className="wg__sub">Acepta la tarifa del dueño o propón la tuya.</p>
        </div>
        <OnlinePill onOpen={onGoHome} />
      </header>

      {won !== null ? (
        <div className="wg__ok wreq__won" role="status">
          <span>Ganaste el paseo de {won}</span>
          <button type="button" className="wg__primary" onClick={onGoRoutes}>Ver en Rutas</button>
        </div>
      ) : null}

      <div className="wg__tabs" role="group" aria-label="Vista">
        <button type="button" className="wg__tab" aria-pressed={tab === "inbox"} onClick={() => setTab("inbox")}>
          Cerca de ti
          {cards !== null && cards.length > 0 ? <span className="wg__tab-count" aria-hidden="true">{cards.length}</span> : null}
        </button>
        <button type="button" className="wg__tab" aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>
          Mis ofertas
          {pending > 0 ? <span className="wg__tab-count" aria-hidden="true">{pending}</span> : null}
        </button>
      </div>

      {tab === "mine" ? <MyOffers walkerId={userId} onGoRoutes={onGoRoutes} /> : null}

      {tab === "inbox" ? (
        <>
          {offline ? (
            <section className="glass wg__card wreq__offline" aria-label="Estás desconectado">
              <span className="wreq__offline-dot" aria-hidden="true" />
              <div>
                <p className="wg__card-title">Estás desconectado</p>
                <p className="wg__muted">Conéctate para que los dueños cerca de ti vean tus ofertas.</p>
              </div>
              <button type="button" className="wg__primary" disabled={presence.busy || presence.cooldown} onClick={() => void presence.toggle()}>
                Conectarme
              </button>
              {presence.error !== null ? <p className="wg__warn" role="alert">{presence.error}</p> : null}
            </section>
          ) : null}
          {error !== null ? (
            <div className="glass wg__card" role="alert">
              <p className="wg__muted">{error}</p>
              <button type="button" className="wg__primary" onClick={() => void load()}>Reintentar</button>
            </div>
          ) : null}
          {cards === null && error === null ? <DogLoader label="Buscando solicitudes…" pose="walk" /> : null}
          {cards !== null && cards.length === 0 && !offline ? (
            <div className="glass wg__empty">
              <MascotSprite pose="wait" size={110} />
              <p>No hay solicitudes cerca ahora. Te avisamos aquí apenas un dueño pida un paseo.</p>
            </div>
          ) : null}
          <ul className="wg__list">
            {(cards ?? []).map((card) => (
              <InboxCard key={card.id} card={card} onChanged={() => void load()} onDrop={drop} onGoHome={onGoHome} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
