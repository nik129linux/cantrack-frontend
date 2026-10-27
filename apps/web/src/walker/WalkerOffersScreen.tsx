import { useCallback, useEffect, useState } from "react";
import {
  acceptOpenOffer,
  declineOpenOffer,
  fetchOpenOffers,
  type WalkerRequestView,
} from "../lib/api.js";
import { formatWhenEs, translateApiError } from "../lib/errors.js";
import { formatCop } from "../home/sampleData.js";
import "../owner/explore.css";

/** How often the open offers refresh while the screen is open. */
export const OFFERS_POLL_MS = 8000;

/**
 * Solicitudes (walker): the open offers owners are waiting on. Each shows the
 * time, the price the owner proposes and the limited dog view; the pin and the
 * owner stay hidden until the walker accepts. First to accept wins; a walker
 * can also hide an offer for themselves.
 */
export function WalkerOffersScreen() {
  const [offers, setOffers] = useState<WalkerRequestView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetchOpenOffers();
    setOffers(data);
  }, []);

  useEffect(() => {
    let isMounted = true;

    void load()
      .then(() => {
        if (isMounted) {
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(translateApiError(loadError, "No pudimos cargar las ofertas."));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    const id = window.setInterval(() => {
      void load().catch(() => undefined);
    }, OFFERS_POLL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(id);
    };
  }, [load]);

  async function accept(offer: WalkerRequestView) {
    setBusyId(offer.id);
    setError(null);
    setNotice(null);
    try {
      const result = await acceptOpenOffer(offer.id);
      setOffers((current) => current.filter((item) => item.id !== offer.id));
      setNotice(
        result.conflicts.length > 0
          ? `Aceptaste el paseo de ${offer.dog.name ?? "un perro"}. Ojo: se cruza con ${result.conflicts.length} de tus paseos.`
          : `Aceptaste el paseo de ${offer.dog.name ?? "un perro"} por ${formatCop(offer.priceCop)}.`,
      );
    } catch (acceptError: unknown) {
      setError(translateApiError(acceptError, "No pudimos aceptar la oferta."));
      await load().catch(() => undefined);
    } finally {
      setBusyId(null);
    }
  }

  async function decline(offer: WalkerRequestView) {
    setBusyId(offer.id);
    setError(null);
    setNotice(null);
    try {
      await declineOpenOffer(offer.id);
      setOffers((current) => current.filter((item) => item.id !== offer.id));
    } catch (declineError: unknown) {
      setError(translateApiError(declineError, "No pudimos rechazar la oferta."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="explore" aria-labelledby="offers-title">
      <header className="explore__head">
        <h1 className="explore__title" id="offers-title">Ofertas de paseo</h1>
        <p className="explore__subtitle">Los dueños proponen el precio. El primero en aceptar se queda con el paseo.</p>
      </header>

      {isLoading ? <p className="explore__status" role="status">Cargando…</p> : null}
      {error !== null ? <p className="explore__error" role="alert">{error}</p> : null}
      {notice !== null ? <p className="explore__notice" role="status">{notice}</p> : null}

      {!isLoading && error === null && offers.length === 0 ? (
        <p className="explore__empty">No hay ofertas por ahora. Te avisamos aquí cuando llegue una.</p>
      ) : null}

      <ul className="explore__list">
        {offers.map((offer) => (
          <li key={offer.id} className="explore__offer">
            <div className="explore__offer-main">
              <strong>{offer.dog.name ?? "Perro"} · {formatCop(offer.priceCop)}</strong>
              <span>{formatWhenEs(offer.requestedTime)}</span>
              <span>
                {[offer.dog.breed, offer.dog.size, offer.dog.temperament]
                  .filter((part): part is string => typeof part === "string" && part.length > 0)
                  .join(" · ") || "Sin más datos"}
              </span>
            </div>
            <div className="explore__offer-actions">
              <button
                type="button"
                className="explore__small explore__small--lime"
                disabled={busyId === offer.id}
                aria-label={`Aceptar a ${offer.dog.name ?? "perro"}`}
                onClick={() => void accept(offer)}
              >
                Aceptar
              </button>
              <button
                type="button"
                className="explore__small explore__small--no"
                disabled={busyId === offer.id}
                aria-label={`Rechazar a ${offer.dog.name ?? "perro"}`}
                onClick={() => void decline(offer)}
              >
                Rechazar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
