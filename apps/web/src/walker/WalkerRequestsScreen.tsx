import { useCallback, useEffect, useState } from "react";
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
import { DogLoader } from "../ui/DogLoader.js";
import { Pill } from "../ui/Pill.js";
import "../owner/explore.css";

/** The inbox refreshes every 10 s while the screen is open. */
export const INBOX_POLL_MS = 10_000;
const STEP_COP = 1000;
const MIN_COUNTER_COP = 8000;

/** The Spanish copy for the statuses the offer endpoints answer. */
export function offerError(error: unknown): string {
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
  return "No pudimos enviar tu oferta.";
}

function Countdown({ deadlineAt }: { deadlineAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((new Date(deadlineAt).getTime() - now) / 1000));
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return <span className="explore__offer-tip">Cierra en {seconds === 0 ? "0:00" : label}</span>;
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
  const eta = etaMinutes(card.distanceKm);
  const maxCounter = card.fareCop * 2;

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

  return (
    <li className="explore__offer" data-status={card.myOffer ? "offered" : "open"}>
      <div className="explore__offer-main">
        <strong>
          {card.dogName ?? "Un perro"} · {Math.round(card.durationHours * 60)} min · a{" "}
          {card.distanceKm.toFixed(1).replace(".", ",")} km · {formatWhenBogota(card.requestedTime)}
        </strong>
        <span className="explore__fare-value">{formatCop(card.fareCop)}</span>
        <span>{card.ownerName ?? "Dueño"}</span>
        <Countdown deadlineAt={card.deadlineAt} />
        {error !== null ? <span className="explore__error" role="alert">{error}</span> : null}
        {needsOnline ? (
          <button type="button" className="explore__small explore__small--lime" onClick={onGoHome}>
            Ir a Inicio y conectarme
          </button>
        ) : null}
      </div>

      {card.myOffer !== null ? (
        <div className="explore__offer-actions">
          <span>Oferta enviada · {formatCop(card.myOffer.priceCop)}</span>
          <button
            type="button"
            className="explore__small"
            disabled={isBusy}
            onClick={() => void run(() => withdrawOffer(card.id))}
          >
            Retirar
          </button>
        </div>
      ) : counter === null ? (
        <div className="explore__offer-actions">
          <button
            type="button"
            className="explore__small explore__small--lime"
            disabled={isBusy}
            onClick={() => void run(() => sendOffer(card.id, { kind: "accept", etaMin: eta }))}
          >
            Aceptar {formatCop(card.fareCop)}
          </button>
          <button
            type="button"
            className="explore__small"
            disabled={isBusy}
            onClick={() => setCounter(Math.min(maxCounter, card.fareCop + STEP_COP))}
          >
            Contraofertar
          </button>
        </div>
      ) : (
        <div className="explore__offer-actions">
          <button
            type="button"
            className="explore__round"
            aria-label="Bajar contraoferta"
            disabled={counter - STEP_COP < Math.max(MIN_COUNTER_COP, STEP_COP)}
            onClick={() => setCounter(counter - STEP_COP)}
          >
            <MinusIcon />
          </button>
          <span aria-live="polite">{formatCop(counter)}</span>
          <button
            type="button"
            className="explore__round"
            aria-label="Subir contraoferta"
            disabled={counter + STEP_COP > maxCounter}
            onClick={() => setCounter(counter + STEP_COP)}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="explore__small explore__small--lime"
            disabled={isBusy}
            onClick={() => void run(() => sendOffer(card.id, { kind: "counter", priceCop: counter, etaMin: eta }))}
          >
            Enviar contraoferta
          </button>
          <button type="button" className="explore__small" onClick={() => setCounter(null)}>
            Cancelar
          </button>
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

function MyOffers({ walkerId, onGoRoutes }: { walkerId: string; onGoRoutes: () => void }) {
  const [offers, setOffers] = useState<MyOffer[] | null>(null);
  const [status, setStatus] = useState<MyOffer["status"] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setOffers(null);
    fetchMyOffers(walkerId, status)
      .then((loaded) => isMounted && setOffers(loaded))
      .catch((failure: unknown) => isMounted && setError(offerError(failure)));
    return () => {
      isMounted = false;
    };
  }, [walkerId, status]);

  return (
    <section className="explore__offers" aria-label="Mis ofertas">
      <div className="explore__segments" role="group" aria-label="Filtro de ofertas">
        <Pill active={status === undefined} onClick={() => setStatus(undefined)}>Todas</Pill>
        {(["pending", "won", "lost"] as const).map((option) => (
          <Pill key={option} active={status === option} onClick={() => setStatus(option)}>
            {OFFER_CHIP[option]}
          </Pill>
        ))}
      </div>
      {error !== null ? <p className="explore__error" role="alert">{error}</p> : null}
      {offers === null && error === null ? <DogLoader label="Cargando tus ofertas…" /> : null}
      {offers !== null && offers.length === 0 ? <p className="explore__empty">Aún no tienes ofertas.</p> : null}
      <ul className="explore__list">
        {(offers ?? []).map((offer) => (
          <li key={offer.offerId} className="explore__offer">
            <div className="explore__offer-main">
              <strong>{offer.dogName ?? "Un perro"} · {formatCop(offer.priceCop)}</strong>
              <span>{formatWhenBogota(offer.requestedTime)} · tarifa {formatCop(offer.fareCop)}</span>
              <span className="explore__offer-tip">{OFFER_CHIP[offer.status]}</span>
            </div>
            {offer.status === "won" ? (
              <div className="explore__offer-actions">
                <button type="button" className="explore__small explore__small--lime" onClick={onGoRoutes}>
                  Ver en Rutas
                </button>
              </div>
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

  const load = useCallback(async () => {
    try {
      setCards(await fetchOpenRequests());
      setError(null);
    } catch (failure: unknown) {
      setError(offerError(failure));
    }
  }, []);

  useEffect(() => {
    if (tab !== "inbox") {
      return;
    }
    void load();
    const id = window.setInterval(() => void load(), INBOX_POLL_MS);
    return () => window.clearInterval(id);
  }, [tab, load]);

  return (
    <div className="explore">
      <header className="explore__head">
        <h1 className="explore__title">Solicitudes</h1>
        <p className="explore__subtitle">Acepta la tarifa del dueño o propón la tuya.</p>
      </header>

      <div className="explore__segments" role="group" aria-label="Vista">
        <Pill active={tab === "inbox"} onClick={() => setTab("inbox")}>Solicitudes</Pill>
        <Pill active={tab === "mine"} onClick={() => setTab("mine")}>Mis ofertas</Pill>
      </div>

      {tab === "mine" ? <MyOffers walkerId={userId} onGoRoutes={onGoRoutes} /> : null}

      {tab === "inbox" ? (
        <>
          {error !== null ? <p className="explore__error" role="alert">{error}</p> : null}
          {cards === null && error === null ? <DogLoader label="Buscando solicitudes…" /> : null}
          {cards !== null && cards.length === 0 ? (
            <p className="explore__empty">
              No hay solicitudes cerca. Si estás desconectado, conéctate en Inicio para recibirlas.
            </p>
          ) : null}
          <ul className="explore__list">
            {(cards ?? []).map((card) => (
              <InboxCard
                key={card.id}
                card={card}
                onChanged={() => void load()}
                onDrop={(id) => setCards((current) => current?.filter((item) => item.id !== id) ?? current)}
                onGoHome={onGoHome}
              />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
