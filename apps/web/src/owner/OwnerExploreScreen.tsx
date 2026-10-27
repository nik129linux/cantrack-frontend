import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  cancelRequest,
  createOpenOffer,
  createRequest,
  fetchDogs,
  fetchRequests,
  fetchWalkerProfiles,
  raiseOfferPrice,
  type Dog,
  type OwnerRequestView,
  type WalkerProfile,
} from "../lib/api.js";
import { formatWhenEs, translateApiError } from "../lib/errors.js";
import {
  PRICE_MAX_COP,
  PRICE_MIN_COP,
  PRICE_STEP_COP,
  WALK_DURATIONS,
  formatCop,
  suggestedFare,
} from "../home/sampleData.js";
import { MinusIcon, PlusIcon } from "../home/icons.js";
import { PickupMap } from "../map/PickupMap.js";
import { parsePin } from "../map/pasto.js";
import "./explore.css";

/** How often the owner's offers refresh while one is still waiting for a walker. */
export const OFFERS_REFRESH_MS = 8000;

const STATUS_LABEL: Record<string, string> = {
  pending: "Esperando respuesta",
  accepted: "Aceptado",
  declined: "Rechazado",
  cancelled: "Cancelado",
};

function offerHeadline(offer: OwnerRequestView): string {
  if (offer.status === "pending" && offer.walkerId === null) {
    return "Buscando cuidador…";
  }
  if (offer.status === "accepted") {
    return `Aceptado por ${offer.walkerName ?? "un cuidador"}`;
  }
  if (offer.status === "pending") {
    return `Esperando a ${offer.walkerName ?? "el cuidador"}`;
  }
  return STATUS_LABEL[offer.status] ?? offer.status;
}

/**
 * Explorar (owner): build the walk — dog, duration, time, pin on the map of
 * Pasto — propose a price (the suggested fare is only the starting point) and
 * send it to every walker. Whoever accepts first gets it; if nobody does the
 * owner raises the price and waits again. A walker can also be picked
 * directly, at the price of their profile.
 */
export function OwnerExploreScreen() {
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [offers, setOffers] = useState<OwnerRequestView[]>([]);
  const [walkers, setWalkers] = useState<WalkerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dogId, setDogId] = useState("");
  const [minutes, setMinutes] = useState<number>(WALK_DURATIONS[1]);
  const [fare, setFare] = useState(suggestedFare(WALK_DURATIONS[1]));
  const [when, setWhen] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    const data = await fetchRequests<OwnerRequestView>();
    setOffers(data);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [loadedDogs, loadedWalkers] = await Promise.all([fetchDogs(), fetchWalkerProfiles()]);
        await loadOffers();
        if (isMounted) {
          setDogs(loadedDogs);
          setWalkers(loadedWalkers);
          setLoadError(null);
        }
      } catch (error: unknown) {
        if (isMounted) {
          setLoadError(translateApiError(error, "No pudimos cargar tus datos."));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [loadOffers]);

  const hasOpenWaiting = offers.some((offer) => offer.status === "pending" && offer.walkerId === null);

  useEffect(() => {
    if (!hasOpenWaiting) {
      return;
    }
    const id = window.setInterval(() => {
      void loadOffers().catch(() => undefined);
    }, OFFERS_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [hasOpenWaiting, loadOffers]);

  function pickDuration(next: number) {
    setMinutes(next);
    setFare(suggestedFare(next));
  }

  function changeFare(delta: number) {
    setFare((current) => Math.min(PRICE_MAX_COP, Math.max(PRICE_MIN_COP, current + delta)));
  }

  function validate(): { pin: { lat: number; lng: number } | null; errors: string[] } {
    const errors: string[] = [];
    if (dogId === "") {
      errors.push("Elige a tu perro.");
    }
    if (when.trim() === "") {
      errors.push("Elige el día y la hora del paseo.");
    }
    const pin = parsePin(lat, lng);
    if (pin === null) {
      errors.push("Marca en el mapa dónde recogen a tu perro (dentro de Pasto).");
    }
    return { pin, errors };
  }

  async function send(target?: WalkerProfile) {
    setNotice(null);
    setActionError(null);

    const { pin, errors } = validate();
    setFormErrors(errors);
    if (errors.length > 0 || pin === null) {
      return;
    }

    setIsSending(true);
    try {
      const requestedTime = new Date(when).toISOString();
      if (target === undefined) {
        await createOpenOffer({
          dogId,
          requestedTime,
          pickupLat: pin.lat,
          pickupLng: pin.lng,
          priceCop: fare,
        });
        setNotice(`Oferta de ${formatCop(fare)} enviada a todos los cuidadores.`);
      } else {
        await createRequest({
          walkerId: target.walkerId,
          dogId,
          requestedTime,
          pickupLat: pin.lat,
          pickupLng: pin.lng,
        });
        setNotice(`Solicitud enviada a ${target.displayName}.`);
      }
      await loadOffers();
    } catch (error: unknown) {
      setActionError(translateApiError(error, "No pudimos enviar tu oferta."));
    } finally {
      setIsSending(false);
    }
  }

  async function raise(offer: OwnerRequestView) {
    setBusyId(offer.id);
    setActionError(null);
    setNotice(null);
    try {
      const next = Math.min(PRICE_MAX_COP, offer.priceCop + PRICE_STEP_COP);
      await raiseOfferPrice(offer.id, next);
      await loadOffers();
      setNotice(`Subiste la oferta a ${formatCop(next)} y volvimos a avisar a los cuidadores.`);
    } catch (error: unknown) {
      setActionError(translateApiError(error, "No pudimos subir el precio."));
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(offer: OwnerRequestView) {
    setBusyId(offer.id);
    setActionError(null);
    setNotice(null);
    try {
      await cancelRequest(offer.id);
      await loadOffers();
      setNotice("Cancelaste la oferta.");
    } catch (error: unknown) {
      setActionError(translateApiError(error, "No pudimos cancelar la oferta."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="explore">
      <header className="explore__head">
        <h1 className="explore__title">Explorar</h1>
        <p className="explore__subtitle">Arma el paseo, ofrece tu precio y el primer cuidador que acepte se lo lleva.</p>
      </header>

      {isLoading ? <p className="explore__status" role="status">Cargando…</p> : null}
      {loadError !== null ? <p className="explore__error" role="alert">{loadError}</p> : null}

      <PickupMap
        lat={lat}
        lng={lng}
        onPick={(pickedLat, pickedLng) => {
          setLat(String(pickedLat));
          setLng(String(pickedLng));
        }}
      />

      <form className="explore__form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void send();
        }}
        noValidate
      >
        <h2 className="explore__section">Tu paseo</h2>

        <div className="explore__field">
          <label className="explore__label" htmlFor="explore-dog">Perro</label>
          <select
            id="explore-dog"
            className="explore__input"
            value={dogId}
            onChange={(event) => setDogId(event.target.value)}
          >
            <option value="">Elige a tu perro</option>
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>{dog.name}</option>
            ))}
          </select>
        </div>

        <div className="explore__field">
          <span className="explore__label" id="explore-duration-label">Duración (sirve para sugerir la tarifa)</span>
          <div className="explore__segments" role="radiogroup" aria-labelledby="explore-duration-label">
            {WALK_DURATIONS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={minutes === option}
                className="explore__segment"
                onClick={() => pickDuration(option)}
              >
                {option} min
              </button>
            ))}
          </div>
        </div>

        <div className="explore__field">
          <label className="explore__label" htmlFor="explore-when">Día y hora</label>
          <input
            id="explore-when"
            className="explore__input"
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
          />
        </div>

        <div className="explore__fare">
          <button
            type="button"
            className="explore__round"
            aria-label="Bajar tarifa"
            disabled={fare <= PRICE_MIN_COP}
            onClick={() => changeFare(-PRICE_STEP_COP)}
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
            disabled={fare >= PRICE_MAX_COP}
            onClick={() => changeFare(PRICE_STEP_COP)}
          >
            <PlusIcon />
          </button>
        </div>
        <p className="explore__hint">
          Tarifa sugerida para {minutes} min: {formatCop(suggestedFare(minutes))}. Tú decides cuánto ofrecer.
        </p>

        {formErrors.map((message) => (
          <p className="explore__error" role="alert" key={message}>{message}</p>
        ))}

        <button type="submit" className="explore__cta" disabled={isSending}>
          {isSending ? "Enviando…" : "Enviar oferta a los cuidadores"}
        </button>
      </form>

      {notice !== null ? <p className="explore__notice" role="status">{notice}</p> : null}
      {actionError !== null ? <p className="explore__error" role="alert">{actionError}</p> : null}

      <section className="explore__offers" aria-labelledby="explore-offers-title">
        <h2 className="explore__section" id="explore-offers-title">Mis ofertas</h2>
        {!isLoading && offers.length === 0 && loadError === null ? (
          <p className="explore__empty">Todavía no has enviado ofertas.</p>
        ) : null}
        <ul className="explore__list">
          {offers.map((offer) => {
            const waiting = offer.status === "pending" && offer.walkerId === null;
            return (
              <li key={offer.id} className="explore__offer" data-status={offer.status}>
                <div className="explore__offer-main">
                  <strong>{offerHeadline(offer)}</strong>
                  <span>
                    {offer.dogName ?? "Tu perro"} · {formatWhenEs(offer.requestedTime)} · {formatCop(offer.priceCop)}
                  </span>
                  {waiting ? (
                    <span className="explore__offer-tip">
                      ¿Nadie acepta? Sube tu oferta y volvemos a avisar a los cuidadores.
                    </span>
                  ) : null}
                </div>
                {offer.status === "pending" ? (
                  <div className="explore__offer-actions">
                    {waiting ? (
                      <button
                        type="button"
                        className="explore__small explore__small--lime"
                        disabled={busyId === offer.id || offer.priceCop >= PRICE_MAX_COP}
                        onClick={() => void raise(offer)}
                      >
                        Subir {formatCop(PRICE_STEP_COP)}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="explore__small"
                      disabled={busyId === offer.id}
                      onClick={() => void cancel(offer)}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {walkers.length > 0 ? (
        <section className="explore__walkers" aria-labelledby="explore-walkers-title">
          <h2 className="explore__section" id="explore-walkers-title">O elige un cuidador</h2>
          <p className="explore__hint">
            Usa el perro, la hora y el punto de arriba, pero al precio del perfil de ese cuidador.
          </p>
          <ul className="explore__list">
            {walkers.map((walker) => (
              <li key={walker.walkerId} className="explore__offer">
                <div className="explore__offer-main">
                  <strong>{walker.displayName}</strong>
                  <span>{walker.serviceArea ?? "Cualquier zona"} · {formatCop(walker.pricePerWalk)}</span>
                </div>
                <div className="explore__offer-actions">
                  <button
                    type="button"
                    className="explore__small explore__small--lime"
                    disabled={isSending}
                    aria-label={`Pedir a ${walker.displayName}`}
                    onClick={() => void send(walker)}
                  >
                    Pedir a {walker.displayName}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
