import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { fetchDogs, type Dog } from "../lib/api.js";
import { ApiError } from "../lib/apiError.js";
import { formatCop, formatWhenBogota } from "../lib/format.js";
import { readHomePoint } from "../lib/homePoint.js";
import { experienceLabel, sizesLabel, walksLabel } from "../lib/walkerCard.js";
import {
  WALK_DURATIONS,
  cancelWalk,
  createBiddingRequest,
  fetchFareSuggestion,
  fetchNearbyWalkers,
  fetchOffers,
  fetchOwnerProfile,
  fetchOwnerRequests,
  parseRequestText,
  pickOffer,
  raiseRequest,
  type BiddingRequestInput,
  type FareSuggestion,
  type Offer,
  type OwnerRequestItem,
} from "../lib/marketplace.js";
import { MinusIcon, PlusIcon } from "../home/icons.js";
import { PickupMap } from "../map/PickupMap.js";
import { parsePin } from "../map/pasto.js";
import { MascotSprite } from "../mascot/MascotSprite.js";
import "./explore.css";
import "./owner-glass.css";
import "./oexplore.css";

/** Offers refresh every 4 s while the request is open (with If-None-Match). */
export const OFFERS_POLL_MS = 4000;
const MAX_FARE_COP = 1_000_000;
const RAISE_STEP_COP = 2000;
/** How long a request takes offers (the API's `auto_pick_after_min`). */
const OFFER_WINDOW_MS = 10 * 60 * 1000;

/** The Spanish copy for the statuses the bidding endpoints answer on this screen. */
export function exploreError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return error.errorId !== null
        ? `Algo falló de nuestro lado. Código: ${error.errorId}`
        : "Algo falló de nuestro lado.";
    }
    if (error.status === 429) {
      return /assistant/i.test(error.message)
        ? "Ya usaste el asistente 10 veces hoy"
        : `Espera ${error.retryAfter ?? "unos"} s antes de intentarlo de nuevo.`;
    }
    if (error.status === 403) {
      return "No tienes acceso a esta solicitud";
    }
    if (error.status === 409) {
      return "La solicitud cambió";
    }
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    if (/failed to fetch|networkerror|load failed/i.test(String((error as Error).message))) {
      return "No pudimos conectar con el servidor. Revisa tu conexión.";
    }
  }
  return fallback;
}

/** Why the first card wins, from its strongest score part. */
function strongestReason(parts: Offer["scoreParts"]): string {
  const entries = Object.entries(parts) as [keyof Offer["scoreParts"], number][];
  const [best] = entries.reduce((top, entry) => (entry[1] > top[1] ? entry : top));
  return { price: "el mejor precio", distance: "el más cerca", rating: "el mejor calificado" }[best];
}

/** A clock that ticks every `ms` while mounted. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** "7:42" left until `deadline`, or null once it passed. */
function timeLeft(deadline: string, now: number): string | null {
  const left = new Date(deadline).getTime() - now;
  if (!(left > 0)) return null;
  const seconds = Math.ceil(left / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A Date as the `datetime-local` value (browser time, which is Bogota here). */
function toLocalInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** The quick "¿Cuándo?" choices that still lie at least 30 min ahead. */
function quickTimes(now: Date): { label: string; value: string }[] {
  const at = (days: number, hour: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return date;
  };
  const soon = new Date(now.getTime() + 60 * 60_000);
  soon.setMinutes(Math.ceil(soon.getMinutes() / 5) * 5, 0, 0);
  const options = [
    { label: "En 1 hora", date: soon },
    { label: "Hoy 5 p. m.", date: at(0, 17) },
    { label: "Mañana 7 a. m.", date: at(1, 7) },
    { label: "Mañana 5 p. m.", date: at(1, 17) },
  ];
  return options
    .filter((option) => option.date.getTime() - now.getTime() >= 30 * 60_000)
    .map((option) => ({ label: option.label, value: toLocalInput(option.date) }));
}

function initial(name: string | null | undefined): string {
  return (name ?? "?").trim().slice(0, 1).toUpperCase() || "?";
}

function OfferCard({
  offer,
  isBest,
  isFavorite,
  onPick,
  isBusy,
}: {
  offer: Offer;
  isBest: boolean;
  isFavorite: boolean;
  onPick: (offer: Offer) => void;
  isBusy: boolean;
}) {
  const name = offer.walkerName ?? "Paseador";
  const rating =
    offer.ratingCount === 0 || offer.allTimeRating === null
      ? "Nuevo"
      : `★ ${offer.allTimeRating.toFixed(1)} (${offer.ratingCount})`;
  const walks = walksLabel(offer.walkerWalksDone);
  const about = [
    experienceLabel(offer.walkerExperienceYears),
    sizesLabel(offer.walkerDogSizes),
    offer.walkerArea ?? null,
  ].filter((text): text is string => text !== null && text !== "");
  return (
    <li className="glass oexplore__offer" data-best={isBest ? "" : undefined}>
      <span className="oexplore__avatar" aria-hidden="true">{initial(name)}</span>
      <div className="oexplore__offer-main">
        {isBest ? <span className="oexplore__best">Mejor opción · {strongestReason(offer.scoreParts)}</span> : null}
        <strong className="oexplore__offer-name">{name}</strong>
        <span className="oexplore__offer-rating">
          {rating}
          {walks !== null ? ` · ${walks}` : ""}
        </span>
        {offer.walkerBio ? <p className="oexplore__offer-bio">{offer.walkerBio}</p> : null}
        <span className="oexplore__chips">
          {isFavorite ? <span className="oexplore__chip oexplore__chip--fav">❤ Tu favorito</span> : null}
          <span className="oexplore__chip">a {offer.distanceKm.toFixed(1).replace(".", ",")} km</span>
          <span className="oexplore__chip">llega en {offer.etaMin} min</span>
          {about.map((text) => (
            <span key={text} className="oexplore__chip">{text}</span>
          ))}
        </span>
      </div>
      <div className="oexplore__offer-side">
        <span className="oexplore__price">{formatCop(offer.priceCop)}</span>
        <button
          type="button"
          className="explore__small explore__small--lime"
          disabled={isBusy}
          aria-label={`Elegir a ${name}`}
          onClick={() => onPick(offer)}
        >
          Elegir
        </button>
      </div>
    </li>
  );
}

type ActiveRequest = Pick<OwnerRequestItem, "id" | "priceCop" | "deadlineAt"> & {
  dogName?: string | null;
  requestedTime?: string;
};

type OffersPanelProps = {
  request: ActiveRequest;
  favorites: ReadonlySet<string>;
  onPicked: () => void;
  onRaised: (next: { priceCop: number; deadlineAt: string }) => void;
  onCancelled: () => void;
  onClose: () => void;
};

/** Ranked offers for one open request: polled every 4 s with the ETag. */
function OffersPanel({ request, favorites, onPicked, onRaised, onCancelled, onClose }: OffersPanelProps) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const etag = useRef<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const now = useNow(1000);

  // The panel sits above the form, far from the "Ver ofertas" button that
  // opens it at the bottom of the screen: bring it into view.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panelRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [request.id]);

  const poll = useCallback(async () => {
    try {
      const result = await fetchOffers(request.id, etag.current);
      etag.current = result.etag;
      if (result.offers !== null) {
        setOffers(result.offers);
      }
      setPollError(null);
    } catch (failure: unknown) {
      setPollError(exploreError(failure, "No pudimos cargar las ofertas."));
    }
  }, [request.id]);

  useEffect(() => {
    etag.current = null;
    setOffers([]);
    void poll();
    const id = window.setInterval(() => void poll(), OFFERS_POLL_MS);
    return () => window.clearInterval(id);
  }, [poll]);

  async function pick(offer: Offer) {
    setIsBusy(true);
    setActionError(null);
    try {
      await pickOffer(request.id, offer.offerId);
      onPicked();
    } catch (failure: unknown) {
      if (failure instanceof ApiError && failure.status === 409) {
        setActionError("Otro paseador ya fue asignado o la solicitud cambió");
        etag.current = null;
        void poll();
      } else {
        setActionError(exploreError(failure, "No pudimos elegir esa oferta."));
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function raise() {
    setIsBusy(true);
    setActionError(null);
    try {
      const next = await raiseRequest(request.id, Math.min(MAX_FARE_COP, request.priceCop + RAISE_STEP_COP));
      onRaised({ priceCop: next.priceCop, deadlineAt: next.deadlineAt });
    } catch (failure: unknown) {
      setActionError(exploreError(failure, "No pudimos subir tu oferta."));
    } finally {
      setIsBusy(false);
    }
  }

  async function cancel() {
    setIsBusy(true);
    setActionError(null);
    try {
      await cancelWalk(request.id);
      onCancelled();
    } catch (failure: unknown) {
      setActionError(exploreError(failure, "No pudimos cancelar la solicitud."));
      setIsBusy(false);
    }
  }

  const left = timeLeft(request.deadlineAt, now);
  const expired = left === null && offers.length === 0;
  const share = Math.max(0, Math.min(1, (new Date(request.deadlineAt).getTime() - now) / OFFER_WINDOW_MS));
  const error = actionError ?? pollError;

  return (
    <section className="oexplore__panel" aria-label="Ofertas recibidas" ref={panelRef}>
      <div className="glass oexplore__waiting">
        <div className="oexplore__waiting-text">
          <span className="oexplore__eyebrow">
            {left !== null ? <span className="oexplore__dot" aria-hidden="true" /> : null}
            {left !== null ? "BUSCANDO PASEADOR" : "OFERTAS CERRADAS"}
          </span>
          <h2 className="oexplore__waiting-title">Ofertas para {request.dogName ?? "tu perro"}</h2>
          <p className="oexplore__waiting-sub">
            {request.requestedTime !== undefined ? `${formatWhenBogota(request.requestedTime)} · ` : ""}
            tu oferta {formatCop(request.priceCop)}
          </p>
          {left !== null ? (
            <>
              <p className="oexplore__countdown" aria-live="off">Cierra en {left}</p>
              <span className="oexplore__bar" aria-hidden="true">
                <span style={{ width: `${share * 100}%` }} />
              </span>
            </>
          ) : null}
          <PanelActions
            confirmCancel={confirmCancel}
            isBusy={isBusy}
            onAsk={() => setConfirmCancel(true)}
            onCancel={() => void cancel()}
            onKeep={() => setConfirmCancel(false)}
            onClose={onClose}
          />
        </div>
        <img className="oexplore__art" src="/art/characters/dog-sit.webp" alt="" draggable={false} />
      </div>

      {offers.length === 0 && !expired ? (
        <p className="explore__empty oexplore__empty-line" role="status">
          Esperando ofertas de paseadores cerca…
        </p>
      ) : null}
      {expired ? (
        <div className="glass oexplore__expired">
          <p>Nadie ofertó a tiempo. Sube un poco tu oferta y la volvemos a abrir 10 minutos.</p>
          <button type="button" className="explore__small explore__small--lime" disabled={isBusy} onClick={() => void raise()}>
            Subir {formatCop(RAISE_STEP_COP)} y volver a abrir
          </button>
        </div>
      ) : null}
      {error !== null ? <p className="explore__error" role="alert">{error}</p> : null}

      <ul className="oexplore__offers">
        {offers.map((offer, index) => (
          <OfferCard
            key={offer.offerId}
            offer={offer}
            isBest={index === 0}
            isFavorite={favorites.has(offer.walkerId)}
            isBusy={isBusy}
            onPick={(o) => void pick(o)}
          />
        ))}
      </ul>

    </section>
  );
}

function PanelActions({
  confirmCancel,
  isBusy,
  onAsk,
  onCancel,
  onKeep,
  onClose,
}: {
  confirmCancel: boolean;
  isBusy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onKeep: () => void;
  onClose: () => void;
}) {
  return (
    <div className="oexplore__panel-actions">
      {confirmCancel ? (
        <div className="oexplore__confirm" role="group" aria-label="Confirmar cancelación">
          <p>¿Cancelar esta solicitud? Los paseadores ya no podrán ofertar.</p>
          <div className="oexplore__confirm-actions">
            <button type="button" className="explore__small explore__small--no" disabled={isBusy} onClick={onCancel}>
              Sí, cancelar
            </button>
            <button type="button" className="explore__small" onClick={onKeep}>
              No
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="explore__small" onClick={onClose}>
            Ocultar
          </button>
          <button type="button" className="explore__small explore__small--no" onClick={onAsk}>
            Cancelar solicitud
          </button>
        </>
      )}
    </div>
  );
}

export type OwnerExploreScreenProps = {
  userId: string;
  /** Called after an offer is picked: the walk now lives in Mis paseos. */
  onPicked?: () => void;
  /** Switch to another tab of the shell (Mis perros when there is no dog). */
  onGo?: (tab: string) => void;
};

/**
 * Explorar (owner), inDrive style: the owner names the fare, nearby walkers
 * accept it or counter, and the owner picks one of the ranked offers.
 */
export function OwnerExploreScreen({ userId, onPicked = () => undefined, onGo }: OwnerExploreScreenProps) {
  const start = readHomePoint();
  const [dogs, setDogs] = useState<Dog[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [dogId, setDogId] = useState("");
  const [minutes, setMinutes] = useState<number>(45);
  const [when, setWhen] = useState("");
  const [fare, setFare] = useState(15000);
  const [suggestion, setSuggestion] = useState<FareSuggestion | null>(null);
  const [lat, setLat] = useState(String(start.lat));
  const [lng, setLng] = useState(String(start.lng));
  const [nearby, setNearby] = useState<number | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [assistantText, setAssistantText] = useState("");
  const [assistantHidden, setAssistantHidden] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveRequest | null>(null);
  const [requests, setRequests] = useState<OwnerRequestItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const now = useNow(30_000);

  // A fare the assistant filled must survive the suggestion refetch it triggers.
  const keepFare = useRef(false);
  const pin = parsePin(lat, lng);
  const pinLat = pin?.lat;
  const pinLng = pin?.lng;

  const loadRequests = useCallback(
    async (cursor?: string | null) => {
      const page = await fetchOwnerRequests(userId, "open", cursor);
      setRequests((current) => (cursor ? [...current, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
    },
    [userId],
  );

  useEffect(() => {
    let isMounted = true;
    setLoadError(null);
    void Promise.all([fetchDogs(), loadRequests()])
      .then(([loaded]) => {
        if (isMounted) {
          setDogs(loaded);
          // One dog: nothing to choose.
          if (loaded.length === 1) setDogId((current) => (current === "" ? loaded[0]!.id : current));
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setLoadError(exploreError(error, "No pudimos cargar tus datos."));
        }
      });
    return () => {
      isMounted = false;
    };
  }, [loadRequests, attempt]);

  // Favorites only add a "❤ Tu favorito" chip; the screen works without them.
  useEffect(() => {
    let isMounted = true;
    void fetchOwnerProfile(userId)
      .then((profile) => {
        if (isMounted) {
          setFavorites(new Set(profile.walkers.filter((walker) => walker.favorite).map((walker) => walker.walkerId)));
        }
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [userId]);

  // The suggested fare follows the duration and the pickup, and nothing else.
  useEffect(() => {
    if (pinLat === undefined || pinLng === undefined) {
      return;
    }
    let isMounted = true;
    void fetchFareSuggestion(minutes, pinLat, pinLng)
      .then((result) => {
        if (isMounted) {
          setSuggestion(result);
          if (keepFare.current) {
            keepFare.current = false;
          } else {
            setFare(result.suggestedCop);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [minutes, pinLat, pinLng, attempt]);

  useEffect(() => {
    if (pinLat === undefined || pinLng === undefined) {
      return;
    }
    let isMounted = true;
    void fetchNearbyWalkers(pinLat, pinLng)
      .then((result) => isMounted && setNearby(result.count))
      .catch(() => isMounted && setNearby(null));
    return () => {
      isMounted = false;
    };
  }, [pinLat, pinLng, attempt]);

  const step = suggestion?.stepCop ?? 1000;
  const minFare = suggestion?.minCop ?? 8000;

  async function publish(input: BiddingRequestInput) {
    setIsSending(true);
    setActionError(null);
    setNotice(null);
    try {
      const created = await createBiddingRequest(input);
      setActive({
        id: created.id,
        priceCop: created.priceCop,
        deadlineAt: created.deadlineAt,
        requestedTime: input.windowStart,
        dogName: dogs?.find((dog) => dog.id === input.dogId)?.name,
      });
      setNotice(`Publicamos tu oferta de ${formatCop(created.priceCop)}.`);
      void loadRequests().catch(() => undefined);
    } catch (error: unknown) {
      setActionError(exploreError(error, "No pudimos publicar tu solicitud."));
    } finally {
      setIsSending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: string[] = [];
    if (dogId === "") {
      errors.push("Elige a tu perro.");
    }
    const startAt = when === "" ? null : new Date(when);
    if (startAt === null || Number.isNaN(startAt.getTime())) {
      errors.push("Elige el día y la hora del paseo.");
    } else if (startAt.getTime() <= Date.now()) {
      errors.push("La hora del paseo debe ser en el futuro.");
    }
    if (pin === null) {
      errors.push("Marca en el mapa dónde recogen a tu perro (dentro de Pasto).");
    }
    setFormErrors(errors);
    setHighlight([]);
    if (errors.length > 0 || startAt === null || pin === null) {
      return;
    }
    void publish({
      dogId,
      windowStart: startAt.toISOString(),
      durationMinutes: minutes,
      priceCop: fare,
      pickupLat: pin.lat,
      pickupLng: pin.lng,
    });
  }

  async function askAssistant() {
    setActionError(null);
    try {
      const result = await parseRequestText(assistantText);
      if (result.aiStatus === "unavailable") {
        setNotice("El asistente no respondió; llena el formulario");
        return;
      }
      const { draft } = result;
      if (draft.dogId !== undefined) setDogId(draft.dogId);
      if (draft.durationMinutes !== undefined) setMinutes(draft.durationMinutes);
      if (draft.priceCop !== undefined) {
        keepFare.current = draft.durationMinutes !== undefined && draft.durationMinutes !== minutes;
        setFare(draft.priceCop);
      }
      if (draft.windowStart !== undefined) {
        setWhen(toLocalInput(new Date(draft.windowStart)));
      }
      setHighlight(result.missing);
      setNotice(null);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 503) {
        setAssistantHidden(true);
      } else {
        setActionError(exploreError(error, "El asistente no respondió; llena el formulario"));
      }
    }
  }

  async function cancelRequest(item: OwnerRequestItem) {
    setActionError(null);
    try {
      await cancelWalk(item.id);
      setConfirmId(null);
      if (active?.id === item.id) setActive(null);
      setNotice(`Cancelamos la solicitud de ${item.dogName ?? "tu perro"}.`);
      await loadRequests();
    } catch (error: unknown) {
      setActionError(exploreError(error, "No pudimos cancelar la solicitud."));
    }
  }

  const missing = (field: string) => (highlight.includes(field) ? " oexplore__step--missing" : "");
  const dogName = dogs?.find((dog) => dog.id === dogId)?.name;
  const quick = quickTimes(new Date(now));
  const whenDate = when === "" ? null : new Date(when);
  const whenLabel = whenDate !== null && !Number.isNaN(whenDate.getTime()) ? formatWhenBogota(whenDate.toISOString()) : null;
  const noDogs = dogs !== null && dogs.length === 0;

  return (
    <div className="explore oglass oexplore">
      <header className="explore__head oexplore__head">
        <h1 className="explore__title">Explorar</h1>
        <p className="explore__subtitle">Pide un paseo, ofrece tu precio y elige a quién le confías tu perro.</p>
        {nearby !== null ? (
          <p className="oexplore__nearby" role="status">
            <span className="oexplore__dot" data-off={nearby === 0 ? "" : undefined} aria-hidden="true" />
            {nearby > 0
              ? `${nearby} paseadores cerca`
              : "Ahora no hay paseadores cerca; tu solicitud igual quedará publicada"}
          </p>
        ) : null}
      </header>

      {loadError !== null ? (
        <div className="glass oglass__retry">
          <p className="explore__error" role="alert">{loadError}</p>
          <button type="button" className="explore__small explore__small--lime" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      ) : null}

      {active !== null ? (
        <OffersPanel
          request={active}
          favorites={favorites}
          onPicked={() => {
            setActive(null);
            onPicked();
          }}
          onRaised={(next) => {
            setActive((current) => (current === null ? null : { ...current, ...next }));
            setNotice(`Subimos tu oferta a ${formatCop(next.priceCop)} y la volvimos a abrir.`);
            void loadRequests().catch(() => undefined);
          }}
          onCancelled={() => {
            setActive(null);
            setNotice("Cancelamos tu solicitud.");
            void loadRequests().catch(() => undefined);
          }}
          onClose={() => setActive(null)}
        />
      ) : null}

      {notice !== null ? <p className="explore__notice" role="status">{notice}</p> : null}
      {actionError !== null ? <p className="explore__error" role="alert">{actionError}</p> : null}

      {noDogs ? (
        <div className="glass oexplore__nodog">
          <MascotSprite pose="wait" size={120} />
          <p>Primero agrega a tu perro para poder pedirle un paseo.</p>
          <button type="button" className="explore__small explore__small--lime" onClick={() => onGo?.("dogs")}>
            Agregar mi perro
          </button>
        </div>
      ) : (
        <form className="oexplore__form" onSubmit={submit} noValidate aria-label="Tu paseo">
          {!assistantHidden ? (
            <details className="glass oexplore__assistant">
              <summary>
                <span>✨ Escríbelo y lo lleno yo</span>
                <span className="oexplore__chev" aria-hidden="true" />
              </summary>
              <div className="oexplore__assistant-body">
                <label className="explore__label" htmlFor="explore-assistant">Escríbelo y lo lleno yo</label>
                <input
                  id="explore-assistant"
                  className="explore__input"
                  maxLength={280}
                  placeholder="Luna mañana a las 5pm, 45 min, 15 mil"
                  value={assistantText}
                  onChange={(event) => setAssistantText(event.target.value)}
                />
                <button
                  type="button"
                  className="explore__small"
                  disabled={assistantText.trim() === ""}
                  onClick={() => void askAssistant()}
                >
                  Llenar con el asistente
                </button>
              </div>
            </details>
          ) : null}

          <section className={`glass oexplore__step${missing("dogId")}`}>
            <h2 className="oexplore__step-title" id="explore-dog-label">¿Quién sale a pasear?</h2>
            <div className="oexplore__dogs" role="radiogroup" aria-labelledby="explore-dog-label">
              {(dogs ?? []).map((dog) => (
                <button
                  key={dog.id}
                  type="button"
                  role="radio"
                  aria-checked={dogId === dog.id}
                  className="oexplore__dog"
                  onClick={() => setDogId(dog.id)}
                >
                  <span className="oexplore__dog-initial" aria-hidden="true">{initial(dog.name)}</span>
                  {dog.name}
                </button>
              ))}
              {dogs === null ? <span className="oexplore__muted">Cargando tus perros…</span> : null}
            </div>
            {highlight.includes("dogId") ? <span className="explore__hint">Completa: perro</span> : null}
          </section>

          <section className={`glass oexplore__step${missing("windowStart")}`}>
            <h2 className="oexplore__step-title">¿Cuándo?</h2>
            <div className="oexplore__times">
              {quick.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={when === option.value}
                  className="oexplore__time"
                  onClick={() => setWhen(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="explore__label" htmlFor="explore-when">Día y hora</label>
            <input
              id="explore-when"
              className="explore__input"
              type="datetime-local"
              value={when}
              min={toLocalInput(new Date(now))}
              onChange={(event) => setWhen(event.target.value)}
            />
            {whenLabel !== null ? <p className="oexplore__picked">🗓 {whenLabel}</p> : null}
            {highlight.includes("windowStart") ? <span className="explore__hint">Completa: hora</span> : null}
          </section>

          <section className="glass oexplore__step">
            <h2 className="oexplore__step-title" id="explore-duration-label">¿Cuánto tiempo?</h2>
            <div className="explore__segments oexplore__durations" role="radiogroup" aria-labelledby="explore-duration-label">
              {WALK_DURATIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={minutes === option}
                  className="explore__segment"
                  onClick={() => setMinutes(option)}
                >
                  {option} min
                </button>
              ))}
            </div>
          </section>

          <section className="glass oexplore__step oexplore__map">
            <h2 className="oexplore__step-title">¿Dónde lo recogemos?</h2>
            <PickupMap
              lat={lat}
              lng={lng}
              onPick={(pickedLat, pickedLng) => {
                setLat(String(pickedLat));
                setLng(String(pickedLng));
              }}
            />
          </section>

          <section className="glass oexplore__step oexplore__fare-card">
            <h2 className="oexplore__step-title">Tu oferta</h2>
            <div className="explore__fare">
              <button
                type="button"
                className="explore__round"
                aria-label="Bajar tarifa"
                disabled={fare - step < minFare}
                onClick={() => setFare((current) => Math.max(minFare, current - step))}
              >
                <MinusIcon />
              </button>
              <p className="explore__fare-value" aria-live="polite">
                {formatCop(fare)}
              </p>
              <button
                type="button"
                className="explore__round"
                aria-label="Subir tarifa"
                disabled={fare + step > MAX_FARE_COP}
                onClick={() => setFare((current) => Math.min(MAX_FARE_COP, current + step))}
              >
                <PlusIcon />
              </button>
            </div>
            {suggestion !== null ? (
              <div className="oexplore__suggest">
                <p className="explore__hint">
                  {suggestion.basis === "market" ? "Precio típico en tu zona" : "Precio sugerido"}:{" "}
                  {formatCop(suggestion.suggestedCop)}
                </p>
                {fare !== suggestion.suggestedCop ? (
                  <button type="button" className="explore__small" onClick={() => setFare(suggestion.suggestedCop)}>
                    Usar sugerido
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className="glass oexplore__submit">
            <p className="oexplore__summary">
              <strong>{dogName ?? "Tu perro"}</strong>
              {" · "}
              {whenLabel ?? "elige la hora"}
              {" · "}
              {minutes} min · <span className="oexplore__summary-price">{formatCop(fare)}</span>
            </p>
            {formErrors.map((message) => (
              <p className="explore__error" role="alert" key={message}>{message}</p>
            ))}
            <button type="submit" className="explore__cta" disabled={isSending}>
              {isSending ? "Publicando…" : "Publicar"}
            </button>
            <p className="oexplore__fineprint">Los paseadores cerca tienen 10 minutos para ofertar.</p>
          </div>
        </form>
      )}

      <section className="glass oexplore__step" aria-labelledby="explore-requests-title">
        <h2 className="oexplore__step-title" id="explore-requests-title">Mis solicitudes</h2>
        {requests.length === 0 ? <p className="explore__empty">Todavía no tienes solicitudes abiertas.</p> : null}
        <ul className="oexplore__requests">
          {requests.map((item) => {
            const left = timeLeft(item.deadlineAt, now);
            const name = item.dogName ?? "tu perro";
            return (
              <li key={item.id} className="oexplore__request">
                <span className="oexplore__dog-initial" aria-hidden="true">{initial(item.dogName)}</span>
                <div className="oexplore__request-main">
                  <strong>{item.dogName ?? "Tu perro"} · {formatCop(item.priceCop)}</strong>
                  <span>{formatWhenBogota(item.requestedTime)}</span>
                  <span className="oexplore__chips">
                    <span className="oexplore__chip oexplore__chip--lime">
                      {item.offerCount} {item.offerCount === 1 ? "oferta" : "ofertas"}
                    </span>
                    <span className="oexplore__chip">{left !== null ? "abierta" : "sin ofertas nuevas"}</span>
                  </span>
                </div>
                {confirmId === item.id ? (
                  <div className="oexplore__request-actions">
                    <button type="button" className="explore__small explore__small--no" onClick={() => void cancelRequest(item)}>
                      Sí, cancelar
                    </button>
                    <button type="button" className="explore__small" onClick={() => setConfirmId(null)}>
                      No
                    </button>
                  </div>
                ) : (
                  <div className="oexplore__request-actions">
                    <button
                      type="button"
                      className="explore__small explore__small--lime"
                      aria-label={`Ver ofertas de ${name}`}
                      onClick={() => setActive(item)}
                    >
                      Ver ofertas
                    </button>
                    <button
                      type="button"
                      className="explore__small explore__small--no"
                      aria-label={`Cancelar solicitud de ${name}`}
                      onClick={() => setConfirmId(item.id)}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {nextCursor !== null ? (
          <button type="button" className="explore__small oexplore__more" onClick={() => void loadRequests(nextCursor)}>
            Ver más
          </button>
        ) : null}
      </section>
    </div>
  );
}
