import { useEffect, useState } from "react";
import { ApiError } from "../lib/apiError.js";
import { formatAgo, formatCop, formatWhenBogota } from "../lib/format.js";
import {
  fetchClientDetail,
  fetchClientList,
  type Client,
  type ClientDetail,
} from "../lib/marketplace.js";
import { DogLoader } from "../ui/DogLoader.js";
import "../owner/explore.css";

function clientsError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return error.errorId !== null
        ? `Algo falló de nuestro lado. Código: ${error.errorId}`
        : "Algo falló de nuestro lado.";
    }
    if (error.status === 429) {
      return "Espera un momento";
    }
  }
  return fallback;
}

const STATUS = { assigned: "Programado", in_walk: "En curso", done: "Terminado" } as const;

function ClientDetailView({ walkerId, ownerId, onBack }: { walkerId: string; ownerId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchClientDetail(walkerId, ownerId)
      .then((loaded) => isMounted && setDetail(loaded))
      .catch((failure: unknown) => {
        if (!isMounted) {
          return;
        }
        // 404: not one of his clients (anymore): back to the list.
        if (failure instanceof ApiError && failure.status === 404) {
          onBack();
        } else {
          setError(clientsError(failure, "No pudimos cargar al cliente."));
        }
      });
    return () => {
      isMounted = false;
    };
  }, [walkerId, ownerId, onBack]);

  return (
    <div className="explore">
      <button type="button" className="explore__small" onClick={onBack}>← Volver</button>
      {error !== null ? <p className="explore__error" role="alert">{error}</p> : null}
      {detail === null && error === null ? <DogLoader label="Cargando al cliente…" /> : null}
      {detail !== null ? (
        <>
          <header className="explore__head">
            <h1 className="explore__title">{detail.ownerName ?? "Dueño"}</h1>
            <p className="explore__subtitle">
              {detail.walksDone} paseos · {formatCop(detail.grossCop)}
            </p>
          </header>

          {detail.phone !== null ? (
            <a className="explore__small explore__small--lime" href={`tel:${detail.phone.replace(/\s/g, "")}`}>
              Llamar
            </a>
          ) : (
            <p className="explore__hint">El contacto se habilita cuando tengas un paseo asignado</p>
          )}

          {detail.dogs.map((dog) => (
            <section key={dog.id} className="explore__offers" aria-label={`Cuidados de ${dog.name ?? "un perro"}`}>
              <h2 className="explore__section">{dog.name ?? "Un perro"}</h2>
              {dog.profile === null ? (
                <p className="explore__empty">Sin notas de cuidado todavía.</p>
              ) : (
                <ul className="explore__list">
                  <li>Tamaño: {dog.profile.size}</li>
                  <li>Temperamento: {dog.profile.temperament}</li>
                  <li>Energía: {dog.profile.energy}</li>
                  <li>Con correa: {dog.profile.leashTrained ? "sí" : "no"}</li>
                  {dog.profile.allergies ? <li>Alergias: {dog.profile.allergies}</li> : null}
                  {dog.profile.medicalNotes ? <li>Notas médicas: {dog.profile.medicalNotes}</li> : null}
                  {dog.profile.vetContact ? <li>Veterinario: {dog.profile.vetContact}</li> : null}
                  {dog.profile.emergencyContact ? <li>Emergencia: {dog.profile.emergencyContact}</li> : null}
                </ul>
              )}
            </section>
          ))}

          <section className="explore__offers" aria-label="Paseos">
            <h2 className="explore__section">Últimos paseos</h2>
            <ul className="explore__list">
              {detail.walks.map((walk) => (
                <li key={walk.id} className="explore__offer">
                  <div className="explore__offer-main">
                    <strong>{walk.dogName ?? "Un perro"} · {STATUS[walk.status]}</strong>
                    <span>{formatWhenBogota(walk.requestedTime)} · {formatCop(walk.priceCop)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

/** Clientes (walker): owners he has won at least one walk from. */
export function WalkerClientsScreen({ userId }: { userId: string }) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchClientList(userId)
      .then((loaded) => isMounted && setClients(loaded))
      .catch((failure: unknown) => isMounted && setError(clientsError(failure, "No pudimos cargar tus clientes.")));
    return () => {
      isMounted = false;
    };
  }, [userId, openId]);

  if (openId !== null) {
    return <ClientDetailView walkerId={userId} ownerId={openId} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="explore">
      <header className="explore__head">
        <h1 className="explore__title">Clientes</h1>
      </header>
      {error !== null ? <p className="explore__error" role="alert">{error}</p> : null}
      {clients === null && error === null ? <DogLoader label="Cargando tus clientes…" /> : null}
      {clients !== null && clients.length === 0 ? (
        <p className="explore__empty">Cuando ganes tu primer paseo, tus clientes aparecen aquí</p>
      ) : null}
      <ul className="explore__list">
        {(clients ?? []).map((client) => (
          <li key={client.ownerId} className="explore__offer">
            <div className="explore__offer-main">
              <strong>
                {client.ownerName ?? "Dueño"} · {client.dogs.map((dog) => dog.name ?? "Un perro").join(", ")}
              </strong>
              <span>
                {client.walksDone} {client.walksDone === 1 ? "paseo" : "paseos"}
                {client.lastWalkAt !== null ? ` · último ${formatAgo(client.lastWalkAt)}` : ""}
                {client.upcoming > 0 ? ` · ${client.upcoming} por venir` : ""}
              </span>
              <span className="explore__fare-value">{formatCop(client.grossCop)}</span>
            </div>
            <div className="explore__offer-actions">
              <button
                type="button"
                className="explore__small explore__small--lime"
                aria-label={`Abrir cliente ${client.ownerName ?? "Dueño"}`}
                onClick={() => setOpenId(client.ownerId)}
              >
                Ver
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
