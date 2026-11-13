import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../lib/apiError.js";
import { formatAgo, formatCop, formatWhenBogota } from "../lib/format.js";
import {
  fetchClientDetail,
  fetchClientList,
  saveDogNote,
  type Client,
  type ClientDetail,
  type ClientDog,
} from "../lib/marketplace.js";
import { MascotSprite } from "../mascot/MascotSprite.js";
import { Avatar } from "../ui/Avatar.js";
import { DogLoader } from "../ui/DogLoader.js";
import { PhoneIcon, PinIcon, ShieldIcon } from "../auth/icons.js";
import "./walker-glass.css";
import "./walker-clients.css";

/** From here on the owner is a regular: worth remembering what their dog likes. */
export const FREQUENT_WALKS = 5;
/** Below this many clients a search box and sort pills are only clutter. */
export const TOOLBAR_FROM = 4;

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
    if (error.status === 404) {
      return "Ese perro ya no es de un cliente tuyo.";
    }
  }
  return fallback;
}

const STATUS = { assigned: "Programado", in_walk: "En curso", done: "Terminado" } as const;
const STATUS_TONE = { assigned: "amber", in_walk: "lime", done: "muted" } as const;
const HANDOFF = {
  in_person: "El dueño te lo entrega en persona",
  doorman: "Lo recibes en portería",
  key: "Entras con llave",
} as const;
const SIZE = { small: "Pequeño", medium: "Mediano", large: "Grande" } as const;
const TEMPERAMENT = { friendly: "Sociable", shy: "Tímido", reactive: "Reactivo" } as const;
const ENERGY = { low: "Energía baja", medium: "Energía media", high: "Energía alta" } as const;

type Sort = "recent" | "walks" | "next";

const SORT_LABEL: Record<Sort, string> = {
  recent: "Recientes",
  walks: "Más paseos",
  next: "Por venir",
};

function dogNames(client: Client): string {
  return client.dogs.map((dog) => dog.name ?? "Un perro").join(", ");
}

/** Clients matching what he typed, by owner name or by any of their dogs. O(n). */
function searchClients(clients: Client[], text: string): Client[] {
  const needle = text.trim().toLowerCase();
  if (needle === "") {
    return clients;
  }
  return clients.filter(
    (client) =>
      (client.ownerName ?? "").toLowerCase().includes(needle) ||
      dogNames(client).toLowerCase().includes(needle),
  );
}

/** The list in the chosen order; the server already sends it by recency. O(n log n). */
function sortClients(clients: Client[], order: Sort): Client[] {
  if (order === "recent") {
    return clients;
  }
  const sorted = [...clients];
  if (order === "walks") {
    sorted.sort((a, b) => b.walksDone - a.walksDone || b.grossCop - a.grossCop);
    return sorted;
  }
  // "Por venir": whoever I see soonest first, clients with nothing pending last.
  sorted.sort((a, b) => {
    const left = a.nextWalkAt ?? null;
    const right = b.nextWalkAt ?? null;
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left.localeCompare(right);
  });
  return sorted;
}

function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="wclients__stars" aria-label={`${rounded} de 5 estrellas`}>
      <span aria-hidden="true">{"★".repeat(rounded)}</span>
    </span>
  );
}

function CallLink({ phone, label }: { phone: string; label: string }) {
  return (
    <a className="wg__ghost wclients__call" href={`tel:${phone.replace(/\s/g, "")}`} aria-label={label}>
      <PhoneIcon /> Llamar
    </a>
  );
}

/** The walker's own note on one dog: write it, save it, nobody else reads it. */
function DogNote({
  walkerId,
  ownerId,
  dog,
  onSaved,
}: {
  walkerId: string;
  ownerId: string;
  dog: ClientDog;
  onSaved: (dogId: string, note: string | null) => void;
}) {
  const [text, setText] = useState(dog.note ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = text.trim() !== (dog.note ?? "").trim();

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveDogNote(walkerId, ownerId, dog.id, text.trim() === "" ? null : text.trim());
      onSaved(dog.id, saved.note);
      setMessage("Guardado");
    } catch (failure: unknown) {
      setError(clientsError(failure, "No pudimos guardar tu nota."));
    } finally {
      setBusy(false);
    }
  }

  const fieldId = `note-${dog.id}`;
  return (
    <div className="wclients__note">
      <label className="wclients__note-label" htmlFor={fieldId}>
        Tus notas sobre {dog.name ?? "este perro"}
      </label>
      <p className="wg__muted">Privadas: solo las ves tú, el dueño nunca las lee.</p>
      <textarea
        id={fieldId}
        className="wclients__textarea"
        value={text}
        maxLength={500}
        rows={3}
        placeholder="Le gusta el parque Infantil. El portero no abre antes de las 7."
        onChange={(event) => {
          setText(event.target.value);
          setMessage(null);
        }}
      />
      <div className="wclients__note-foot">
        <span className="wg__muted">{text.length}/500</span>
        {message !== null ? <span className="wclients__saved" role="status">{message}</span> : null}
        <button
          type="button"
          className="wg__primary"
          disabled={busy || !dirty}
          aria-label={`Guardar tus notas sobre ${dog.name ?? "este perro"}`}
          onClick={() => void save()}
        >
          Guardar
        </button>
      </div>
      {error !== null ? <p className="wg__warn" role="alert">{error}</p> : null}
    </div>
  );
}

function CareCard({
  walkerId,
  ownerId,
  dog,
  onSaved,
}: {
  walkerId: string;
  ownerId: string;
  dog: ClientDog;
  onSaved: (dogId: string, note: string | null) => void;
}) {
  const profile = dog.profile;
  const facts: string[] = [];
  if (profile !== null) {
    facts.push(`Tamaño: ${SIZE[profile.size as keyof typeof SIZE] ?? profile.size}`);
    facts.push(`Temperamento: ${TEMPERAMENT[profile.temperament as keyof typeof TEMPERAMENT] ?? profile.temperament}`);
    facts.push(ENERGY[profile.energy as keyof typeof ENERGY] ?? `Energía: ${profile.energy}`);
    facts.push(`Con correa: ${profile.leashTrained ? "sí" : "no"}`);
  }
  const nothing = profile === null && !dog.notes && !dog.breed;

  return (
    <section className="glass wg__card wclients__care" aria-label={`Cuidados de ${dog.name ?? "un perro"}`}>
      <div className="wclients__care-head">
        <span className="wg__avatar" aria-hidden="true">{(dog.name ?? "?").charAt(0).toUpperCase()}</span>
        <div>
          <h3 className="wg__card-title">{dog.name ?? "Un perro"}</h3>
          {dog.breed ? <p className="wg__muted">{dog.breed}</p> : null}
        </div>
      </div>

      {dog.notes ? <p className="wclients__owner-note">{dog.notes}</p> : null}
      {nothing ? <p className="wg__muted">Sin notas de cuidado todavía.</p> : null}

      {facts.length > 0 ? (
        <ul className="wg__chips">
          {facts.map((fact) => (
            <li key={fact} className="wg__chip">{fact}</li>
          ))}
        </ul>
      ) : null}

      {profile !== null ? (
        <ul className="wclients__facts">
          {profile.allergies ? (
            <li className="wclients__alert">Alergias: {profile.allergies}</li>
          ) : null}
          {profile.medicalNotes ? <li>Notas médicas: {profile.medicalNotes}</li> : null}
          {profile.vetContact ? <li>Veterinario: {profile.vetContact}</li> : null}
          {profile.emergencyContact ? <li>Emergencia: {profile.emergencyContact}</li> : null}
        </ul>
      ) : null}

      <DogNote walkerId={walkerId} ownerId={ownerId} dog={dog} onSaved={onSaved} />
    </section>
  );
}

function DoorCard({ detail }: { detail: ClientDetail }) {
  const care = detail.care ?? null;
  if (care === null) {
    return (
      <section className="glass wg__card" aria-label="Cómo recibir al perro">
        <h2 className="wg__card-title">Cómo recibir al perro</h2>
        <p className="wg__muted">
          La dirección de recogida, el contacto de emergencia y el veterinario se habilitan cuando tengas un paseo con
          este cliente.
        </p>
      </section>
    );
  }
  const nothing =
    !care.pickupNotes && !care.handoff && !care.emergencyName && !care.emergencyPhone && !care.vetName && !care.vetPhone;
  return (
    <section className="glass wg__card" aria-label="Cómo recibir al perro">
      <h2 className="wg__card-title">Cómo recibir al perro</h2>
      {nothing ? <p className="wg__muted">El dueño todavía no dejó indicaciones.</p> : null}
      {care.pickupNotes ? (
        <p className="wclients__pickup"><PinIcon /> {care.pickupNotes}</p>
      ) : null}
      {care.handoff ? <p className="wg__muted">{HANDOFF[care.handoff] ?? care.handoff}</p> : null}
      {care.emergencyName || care.emergencyPhone ? (
        <div className="wclients__contact">
          <div>
            <strong>Emergencia: {care.emergencyName ?? "contacto"}</strong>
            {care.emergencyRelation ? <span className="wg__muted"> · {care.emergencyRelation}</span> : null}
          </div>
          {care.emergencyPhone ? (
            <CallLink phone={care.emergencyPhone} label={`Llamar a ${care.emergencyName ?? "emergencia"}`} />
          ) : null}
        </div>
      ) : null}
      {care.vetName || care.vetPhone ? (
        <div className="wclients__contact">
          <div><strong>Veterinario: {care.vetName ?? "sin nombre"}</strong></div>
          {care.vetPhone ? <CallLink phone={care.vetPhone} label={`Llamar al veterinario`} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function ClientDetailView({
  walkerId,
  ownerId,
  onBack,
  onGoRoutes,
}: {
  walkerId: string;
  ownerId: string;
  onBack: () => void;
  onGoRoutes?: () => void;
}) {
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

  const onNoteSaved = useCallback((dogId: string, note: string | null) => {
    setDetail((current) =>
      current === null
        ? current
        : { ...current, dogs: current.dogs.map((dog) => (dog.id === dogId ? { ...dog, note } : dog)) },
    );
  }, []);

  const name = detail?.ownerName ?? "Dueño";

  return (
    <div className="wglass wclients">
      <button type="button" className="wg__ghost wclients__back" onClick={onBack}>← Volver</button>
      {error !== null ? <p className="wg__warn" role="alert">{error}</p> : null}
      {detail === null && error === null ? <DogLoader label="Cargando al cliente…" /> : null}
      {detail !== null ? (
        <>
          <header className="glass wg__card wclients__hero">
            <Avatar src={detail.ownerAvatarUrl ?? undefined} alt={name} name={name} size={72} />
            <div className="wclients__hero-main">
              <h1 className="wclients__hero-name">{name}</h1>
              <ul className="wg__chips">
                <li className="wg__chip">{detail.walksDone} {detail.walksDone === 1 ? "paseo" : "paseos"}</li>
                <li className="wg__chip">{formatCop(detail.grossCop)}</li>
                {detail.lastWalkAt !== null ? (
                  <li className="wg__chip" data-tone="muted">último {formatAgo(detail.lastWalkAt)}</li>
                ) : null}
                {detail.walksDone >= FREQUENT_WALKS ? (
                  <li className="wg__chip" data-tone="lime"><ShieldIcon /> Cliente frecuente</li>
                ) : null}
              </ul>
            </div>
            {detail.phone !== null ? (
              <CallLink phone={detail.phone} label={`Llamar a ${name}`} />
            ) : null}
          </header>

          {detail.phone === null ? (
            <p className="wg__muted wclients__gate">El contacto se habilita cuando tengas un paseo asignado</p>
          ) : null}

          {detail.upcoming > 0 && detail.nextWalkAt ? (
            <section className="glass wg__card wclients__next" aria-label="Próximo paseo">
              <div>
                <p className="wclients__eyebrow">Próximo paseo</p>
                <strong>{formatWhenBogota(detail.nextWalkAt)}</strong>
              </div>
              {onGoRoutes !== undefined ? (
                <button type="button" className="wg__primary" onClick={onGoRoutes}>Ver en Rutas</button>
              ) : null}
            </section>
          ) : null}

          <DoorCard detail={detail} />

          {detail.dogs.map((dog) => (
            <CareCard key={dog.id} walkerId={walkerId} ownerId={ownerId} dog={dog} onSaved={onNoteSaved} />
          ))}

          <section className="glass wg__card" aria-label="Paseos">
            <h2 className="wg__card-title">Últimos paseos</h2>
            <ul className="wclients__walks">
              {detail.walks.map((walk) => (
                <li key={walk.id}>
                  <div className="wclients__walk-main">
                    <strong>{walk.dogName ?? "Un perro"}</strong>
                    <span className="wg__muted">{formatWhenBogota(walk.requestedTime)}</span>
                  </div>
                  <ul className="wg__chips">
                    <li className="wg__chip" data-tone={STATUS_TONE[walk.status]}>{STATUS[walk.status]}</li>
                    <li className="wg__chip" data-tone="muted">{formatCop(walk.priceCop)}</li>
                  </ul>
                  {walk.rating !== null && walk.rating !== undefined ? <Stars rating={walk.rating} /> : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

export type WalkerClientsScreenProps = {
  userId: string;
  onGoRoutes?: () => void;
};

/** Clientes (walker): the owners he has won a walk from, and his notes on their dogs. */
export function WalkerClientsScreen({ userId, onGoRoutes }: WalkerClientsScreenProps) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  useEffect(() => {
    let isMounted = true;
    fetchClientList(userId)
      .then((loaded) => isMounted && setClients(loaded))
      .catch((failure: unknown) => isMounted && setError(clientsError(failure, "No pudimos cargar tus clientes.")));
    return () => {
      isMounted = false;
    };
  }, [userId, openId, attempt]);

  const shown = useMemo(
    () => sortClients(searchClients(clients ?? [], search), sort),
    [clients, search, sort],
  );

  const totals = useMemo(() => {
    const list = clients ?? [];
    return {
      walks: list.reduce((sum, client) => sum + client.walksDone, 0),
      gross: list.reduce((sum, client) => sum + client.grossCop, 0),
    };
  }, [clients]);

  if (openId !== null) {
    return <ClientDetailView walkerId={userId} ownerId={openId} onBack={() => setOpenId(null)} onGoRoutes={onGoRoutes} />;
  }

  const many = (clients ?? []).length >= TOOLBAR_FROM;

  return (
    <div className="wglass wclients">
      <header className="wg__head">
        <div>
          <h1 className="wg__title">Clientes</h1>
          {clients !== null && clients.length > 0 ? (
            <p className="wg__sub">
              {clients.length} {clients.length === 1 ? "cliente" : "clientes"} · {totals.walks}{" "}
              {totals.walks === 1 ? "paseo" : "paseos"} · {formatCop(totals.gross)}
            </p>
          ) : (
            <p className="wg__sub">Los dueños que ya te eligieron.</p>
          )}
        </div>
      </header>

      {many ? (
        <div className="wclients__toolbar">
          <input
            type="search"
            className="wclients__search"
            value={search}
            placeholder="Buscar dueño o perro"
            aria-label="Buscar dueño o perro"
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="wg__filters" role="group" aria-label="Ordenar clientes">
            {(["recent", "walks", "next"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className="wg__filter"
                aria-pressed={sort === option}
                onClick={() => setSort(option)}
              >
                {SORT_LABEL[option]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error !== null ? (
        <div className="glass wg__card" role="alert">
          <p className="wg__muted">{error}</p>
          <button type="button" className="wg__primary" onClick={() => setAttempt((n) => n + 1)}>Reintentar</button>
        </div>
      ) : null}
      {clients === null && error === null ? <DogLoader label="Cargando tus clientes…" pose="walk" /> : null}

      {clients !== null && clients.length === 0 ? (
        <div className="glass wg__empty">
          <MascotSprite pose="wait" size={96} />
          <p>Cuando ganes tu primer paseo, tus clientes aparecen aquí</p>
        </div>
      ) : null}

      {clients !== null && clients.length > 0 && shown.length === 0 ? (
        <div className="glass wg__empty">
          <p>Ningún cliente coincide con "{search}".</p>
        </div>
      ) : null}

      <ul className="wg__list">
        {shown.map((client) => {
          const name = client.ownerName ?? "Dueño";
          return (
            <li key={client.ownerId} className="glass wclients__card wg__rise">
              <span className="wg__avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
              <div className="wclients__main">
                <strong className="wclients__name">{name}</strong>
                <ul className="wg__chips">
                  {client.dogs.map((dog) => (
                    <li key={dog.id} className="wg__chip">{dog.name ?? "Un perro"}</li>
                  ))}
                </ul>
                <ul className="wg__chips">
                  <li className="wg__chip" data-tone="muted">
                    {client.walksDone} {client.walksDone === 1 ? "paseo" : "paseos"}
                  </li>
                  {client.lastWalkAt !== null ? (
                    <li className="wg__chip" data-tone="muted">último {formatAgo(client.lastWalkAt)}</li>
                  ) : null}
                  {client.upcoming > 0 ? (
                    <li className="wg__chip" data-tone="lime">{client.upcoming} por venir</li>
                  ) : null}
                  {client.walksDone >= FREQUENT_WALKS ? (
                    <li className="wg__chip" data-tone="lime">Cliente frecuente</li>
                  ) : null}
                </ul>
              </div>
              <div className="wclients__side">
                <strong className="wclients__gross">{formatCop(client.grossCop)}</strong>
                <button
                  type="button"
                  className="wg__primary"
                  aria-label={`Abrir cliente ${name}`}
                  onClick={() => setOpenId(client.ownerId)}
                >
                  Ver
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
