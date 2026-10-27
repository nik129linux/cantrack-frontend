import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { fetchDogs, type Dog } from "../lib/api.js";
import { ApiError } from "../lib/apiError.js";
import { formatCop, formatWhenBogota } from "../lib/format.js";
import { readHomePoint } from "../lib/homePoint.js";
import {
  WALK_DURATIONS,
  createBiddingRequest,
  fetchFareSuggestion,
  fetchNearbyWalkers,
  fetchOffers,
  fetchOwnerRequests,
  parseRequestText,
  pickOffer,
  type BiddingRequestInput,
  type FareSuggestion,
  type Offer,
  type OwnerRequestItem,
} from "../lib/marketplace.js";
import { MinusIcon, PlusIcon } from "../home/icons.js";
import { PickupMap } from "../map/PickupMap.js";
import { parsePin } from "../map/pasto.js";
import "./explore.css";

/** Offers refresh every 4 s while the request is open (with If-None-Match). */
export const OFFERS_POLL_MS = 4000;
const MAX_FARE_COP = 1_000_000;
const RAISE_STEP_COP = 2000;

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

function OfferCard({
  offer,
  isBest,
  onPick,
  isBusy,
}: {
  offer: Offer;
  isBest: boolean;
  onPick: (offer: Offer) => void;
  isBusy: boolean;
}) {
  const rating =
    offer.ratingCount === 0 || offer.allTimeRating === null
      ? "Nuevo"
      : `★ ${offer.allTimeRating.toFixed(1)} (${offer.ratingCount})`;
  return (
    <li className="explore__offer" data-best={isBest ? "" : undefined}>
      <div className="explore__offer-main">
        {isBest ? (
          <span className="explore__offer-tip">Mejor opción · {strongestReason(offer.scoreParts)}</span>
        ) : null}
        <strong>{offer.walkerName ?? "Paseador"} · {rating}</strong>
        <span>
          a {offer.distanceKm.toFixed(1).replace(".", ",")} km · llega en {offer.etaMin} min ·{" "}
          {formatCop(offer.priceCop)}
        </span>
      </div>
      <div className="explore__offer-actions">
        <button
          type="button"
          className="explore__small explore__small--lime"
          disabled={isBusy}
          aria-label={`Elegir a ${offer.walkerName ?? "Paseador"}`}
          onClick={() => onPick(offer)}
        >
          Elegir
        </button>
      </div>
    </li>
  );
}

type OffersPanelProps = {
  request: Pick<OwnerRequestItem, "id" | "priceCop" | "deadlineAt"> & { dogName?: string | null };
  onPicked: () => void;
  onRepublish: () => void;
};

/** Ranked offers for one open request: polled every 4 s with the ETag. */
function OffersPanel({ request, onPicked, onRepublish }: OffersPanelProps) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const etag = useRef<string | null>(null);

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
    setPickError(null);
    try {
      await pickOffer(request.id, offer.offerId);
      onPicked();
    } catch (failure: unknown) {
      if (failure instanceof ApiError && failure.status === 409) {
        setPickError("Otro paseador ya fue asignado o la solicitud cambió");
        etag.current = null;
        void poll();
      } else {
        setPickError(exploreError(failure, "No pudimos elegir esa oferta."));
      }
    } finally {
      setIsBusy(false);
    }
  }

  const expired = new Date(request.deadlineAt).getTime() < Date.now() && offers.length === 0;

  return (
    <section className="explore__offers" aria-label="Ofertas recibidas">
      <h2 className="explore__section">Ofertas para {request.dogName ?? "tu perro"}</h2>
      {offers.length === 0 && !expired ? (
        <p className="explore__empty" role="status">Esperando ofertas de paseadores cerca…</p>
      ) : null}
      {expired ? (
        <div>
          <p className="explore__empty">Nadie ofertó a tiempo.</p>
          <button type="button" className="explore__small explore__small--lime" onClick={onRepublish}>
            Subir {formatCop(RAISE_STEP_COP)} y volver a publicar
          </button>
        </div>
      ) : null}
      {pollError ?? pickError ? <p className="explore__error" role="alert">{pickError ?? pollError}</p> : null}
      <ul className="explore__list">
        {offers.map((offer, index) => (
          <OfferCard key={offer.offerId} offer={offer} isBest={index === 0} isBusy={isBusy} onPick={(o) => void pick(o)} />
        ))}
      </ul>
    </section>
  );
}

export type OwnerExploreScreenProps = {
  userId: string;
  /** Called after an offer is picked: the walk now lives in Mis paseos. */
  onPicked?: () => void;
};

/**
 * Explorar (owner), inDrive style: the owner names the fare, nearby walkers
 * accept it or counter, and the owner picks one of the ranked offers.
 */
export function OwnerExploreScreen({ userId, onPicked = () => undefined }: OwnerExploreScreenProps) {
  const start = readHomePoint();
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [active, setActive] = useState<OffersPanelProps["request"] | null>(null);
  const [requests, setRequests] = useState<OwnerRequestItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [lastInput, setLastInput] = useState<BiddingRequestInput | null>(null);

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
    void Promise.all([fetchDogs(), loadRequests()])
      .then(([loaded]) => {
        if (isMounted) {
          setDogs(loaded);
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
  }, [loadRequests]);

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
  }, [minutes, pinLat, pinLng]);

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
  }, [pinLat, pinLng]);

  const step = suggestion?.stepCop ?? 1000;
  const minFare = suggestion?.minCop ?? 8000;

  async function publish(input: BiddingRequestInput) {
    setIsSending(true);
    setActionError(null);
    setNotice(null);
    try {
      const created = await createBiddingRequest(input);
      setLastInput(input);
      setActive({
        id: created.id,
        priceCop: created.priceCop,
        deadlineAt: created.deadlineAt,
        dogName: dogs.find((dog) => dog.id === input.dogId)?.name,
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
        const local = new Date(draft.windowStart);
        local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
        setWhen(local.toISOString().slice(0, 16));
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

  function republish() {
    if (lastInput === null) {
      return;
    }
    const raised = Math.min(MAX_FARE_COP, lastInput.priceCop + RAISE_STEP_COP);
    void publish({ ...lastInput, priceCop: raised });
  }

  const missingLabel = (field: string) => (highlight.includes(field) ? " explore__label--missing" : "");

  return (
    <div className="explore">
      <header className="explore__head">
        <h1 className="explore__title">Explorar</h1>
        <p className="explore__subtitle">Ofrece tu precio y elige entre las ofertas de paseadores cerca.</p>
      </header>

      {loadError !== null ? <p className="explore__error" role="alert">{loadError}</p> : null}

      {active !== null ? (
        <OffersPanel
          request={active}
          onPicked={() => {
            setActive(null);
            onPicked();
          }}
          onRepublish={republish}
        />
      ) : null}

      <PickupMap
        lat={lat}
        lng={lng}
        onPick={(pickedLat, pickedLng) => {
          setLat(String(pickedLat));
          setLng(String(pickedLng));
        }}
      />
      {nearby !== null ? (
        <p className="explore__hint" role="status">
          {nearby > 0
            ? `${nearby} paseadores cerca`
            : "Ahora no hay paseadores cerca; tu solicitud igual quedará publicada"}
        </p>
      ) : null}

      <form className="explore__form" onSubmit={submit} noValidate>
        <h2 className="explore__section">Tu paseo</h2>

        {!assistantHidden ? (
          <div className="explore__field">
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
        ) : null}

        <div className="explore__field">
          <label className={`explore__label${missingLabel("dogId")}`} htmlFor="explore-dog">Perro</label>
          <select id="explore-dog" className="explore__input" value={dogId} onChange={(event) => setDogId(event.target.value)}>
            <option value="">Elige a tu perro</option>
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>{dog.name}</option>
            ))}
          </select>
          {highlight.includes("dogId") ? <span className="explore__hint">Completa: perro</span> : null}
        </div>

        <div className="explore__field">
          <span className="explore__label" id="explore-duration-label">Duración</span>
          <div className="explore__segments" role="radiogroup" aria-labelledby="explore-duration-label">
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
        </div>

        <div className="explore__field">
          <label className={`explore__label${missingLabel("windowStart")}`} htmlFor="explore-when">Día y hora</label>
          <input
            id="explore-when"
            className="explore__input"
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
          />
          {highlight.includes("windowStart") ? <span className="explore__hint">Completa: hora</span> : null}
        </div>

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
            <span className="explore__fare-caption">Tu oferta</span>
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
          <p className="explore__hint">
            {suggestion.basis === "market" ? "Precio típico en tu zona" : "Precio sugerido"}:{" "}
            {formatCop(suggestion.suggestedCop)}
          </p>
        ) : null}

        {formErrors.map((message) => (
          <p className="explore__error" role="alert" key={message}>{message}</p>
        ))}

        <button type="submit" className="explore__cta" disabled={isSending}>
          {isSending ? "Publicando…" : "Publicar"}
        </button>
      </form>

      {notice !== null ? <p className="explore__notice" role="status">{notice}</p> : null}
      {actionError !== null ? <p className="explore__error" role="alert">{actionError}</p> : null}

      <section className="explore__offers" aria-labelledby="explore-requests-title">
        <h2 className="explore__section" id="explore-requests-title">Mis solicitudes</h2>
        {requests.length === 0 ? <p className="explore__empty">Todavía no tienes solicitudes abiertas.</p> : null}
        <ul className="explore__list">
          {requests.map((item) => (
            <li key={item.id} className="explore__offer">
              <div className="explore__offer-main">
                <strong>{item.dogName ?? "Tu perro"} · {formatCop(item.priceCop)}</strong>
                <span>{formatWhenBogota(item.requestedTime)} · {item.offerCount} {item.offerCount === 1 ? "oferta" : "ofertas"}</span>
              </div>
              <div className="explore__offer-actions">
                <button
                  type="button"
                  className="explore__small explore__small--lime"
                  aria-label={`Ver ofertas de ${item.dogName ?? "tu perro"}`}
                  onClick={() => setActive(item)}
                >
                  Ver ofertas
                </button>
              </div>
            </li>
          ))}
        </ul>
        {nextCursor !== null ? (
          <button type="button" className="explore__small" onClick={() => void loadRequests(nextCursor)}>
            Ver más
          </button>
        ) : null}
      </section>
    </div>
  );
}
