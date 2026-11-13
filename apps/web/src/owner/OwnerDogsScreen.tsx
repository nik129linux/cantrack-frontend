import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  createDog,
  deleteDog,
  enrollPhotos,
  fetchDogs,
  fetchTimeline,
  saveDogProfile,
  suggestDogTraits,
  updateDog,
  type Dog,
  type DogProfile,
  type DogTraits,
  type TimelineItem,
} from "../lib/api.js";
import { translateApiError } from "../lib/errors.js";
import { formatWhenBogota } from "../lib/format.js";
import { resizeImage } from "../lib/image.js";
import { DogLoader } from "../ui/DogLoader.js";
import { PawLineIcon } from "../home/icons.js";
import "./owner-glass.css";
import "./dogs.css";

const SIZES = [
  { id: "small", label: "Pequeño" },
  { id: "medium", label: "Mediano" },
  { id: "large", label: "Grande" },
];
const TEMPERAMENTS = [
  { id: "friendly", label: "Amigable" },
  { id: "shy", label: "Tímido" },
  { id: "reactive", label: "Reactivo" },
];
const ENERGIES = [
  { id: "low", label: "Baja" },
  { id: "medium", label: "Media" },
  { id: "high", label: "Alta" },
];
const sizeLabel = (size?: string | null) => SIZES.find((option) => option.id === size)?.label ?? "";
const complete = (dog: Dog) => Boolean(dog.profile?.size && dog.profile.temperament && dog.profile.energy);
const trimToNull = (value: string) => value.trim() || null;
type Feedback = { error?: boolean; text: string } | null;

function FeedbackLine({ value }: { value: Feedback }) {
  return value ? (
    <p className={value.error ? "dogs__error" : "home__note"} role={value.error ? "alert" : "status"}>
      {value.text}
    </p>
  ) : null;
}

function StatusChips({ dog }: { dog: Dog }) {
  return (
    <span className="home__chips dogs__chips">
      <span className="dogs__chip" data-ready={dog.hasPhotos}>
        {dog.hasPhotos ? "Fotos listas" : "Faltan fotos"}
      </span>
      <span className="dogs__chip" data-ready={complete(dog)}>
        {complete(dog) ? "Ficha completa" : "Ficha incompleta"}
      </span>
    </span>
  );
}

function Section({
  title,
  summary,
  children,
  open,
  onToggle,
}: {
  title: string;
  summary: string;
  children: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  return (
    <details
      className="glass dogs__section"
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
    >
      <summary className="dogs__summary">
        <span>{title}</span>
        <span className="dogs__summary-value">{summary}</span>
        <span className="dogs__chevron" aria-hidden="true" />
      </summary>
      <div className="dogs__body">{children}</div>
    </details>
  );
}

function Choice({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="dogs__field">
      <span className="dogs__label">{name}</span>
      <div className="home__segments" role="radiogroup" aria-label={name}>
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            className="home__segment"
            aria-checked={value === option.id}
            tabIndex={value === option.id || (!value && index === 0) ? 0 : -1}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => {
              const direction =
                event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? 1
                  : event.key === "ArrowLeft" || event.key === "ArrowUp"
                    ? -1
                    : 0;
              if (!direction && event.key !== "Home" && event.key !== "End") {
                return;
              }
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? options.length - 1
                    : (index + direction + options.length) % options.length;
              const option = options[next];
              if (option) {
                onChange(option.id);
              }
              (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function useOwnerDogsScreenMount() {
  const screenRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const screen = screenRef.current;
    if (screen === null || typeof document === "undefined") {
      return;
    }
    const container = screen.parentElement;
    if (container?.parentElement !== document.body) {
      return;
    }
    for (const child of Array.from(document.body.children)) {
      if (child !== container && child.querySelector("[data-cantrack-owner-dogs-screen]") !== null) {
        child.remove();
      }
    }
  }, []);
  return screenRef;
}

function AddDog({ onCreated, onCancel }: { onCreated: (dog: Dog) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setFeedback({ error: true, text: "Escribe el nombre de tu perro" });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      onCreated(await createDog({ name: name.trim(), ...(breed.trim() ? { breed: breed.trim() } : {}) }));
    } catch (error) {
      setFeedback({ error: true, text: translateApiError(error, "No pudimos agregar a tu perro.") });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="glass dogs__card dogs__form" aria-label="Agregar perro" onSubmit={submit}>
      <h2 className="home__card-title">Agregar perro</h2>
      <div className="dogs__field">
        <label htmlFor="new-dog-name">Nombre</label>
        <input
          className="dogs__input"
          id="new-dog-name"
          required
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="dogs__field">
        <label htmlFor="new-dog-breed">Raza (opcional)</label>
        <input
          className="dogs__input"
          id="new-dog-breed"
          maxLength={80}
          value={breed}
          onChange={(event) => setBreed(event.target.value)}
          aria-describedby="new-dog-hint"
        />
        <span id="new-dog-hint" className="home__note">
          Si no la sabes, la IA te la sugiere con una foto
        </span>
      </div>
      <div className="dogs__actions">
        <button className="home__cta" disabled={busy}>
          Guardar perro
        </button>
        <button type="button" className="dogs__button" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      <FeedbackLine value={feedback} />
    </form>
  );
}

function DogFicha({
  dog,
  photosOpen,
  onPatch,
  onDelete,
  onBack,
  onGo,
}: {
  dog: Dog;
  photosOpen: boolean;
  onPatch: (patch: Partial<Dog>) => void;
  onDelete: () => void;
  onBack: () => void;
  onGo?: (tab: string) => void;
}) {
  const [name, setName] = useState(dog.name);
  const [breed, setBreed] = useState(dog.breed ?? "");
  const [notes, setNotes] = useState(dog.notes ?? "");
  const [profile, setProfile] = useState<DogProfile>(
    () =>
      dog.profile ?? {
        size: "",
        temperament: "",
        energy: "",
        leashTrained: false,
        allergies: null,
        medicalNotes: null,
        vetContact: null,
        emergencyContact: null,
      },
  );
  const [open, setOpen] = useState<Record<string, boolean>>({ data: !photosOpen, photos: photosOpen });
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [suggestion, setSuggestion] = useState<DogTraits | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineAttempt, setTimelineAttempt] = useState(0);
  const photoInput = useRef<HTMLInputElement>(null);
  const suggestionVersion = useRef(0);
  useEffect(
    () => () => {
      suggestionVersion.current += 1;
    },
    [],
  );
  const tell = (section: string, value: Feedback) =>
    setFeedback((current) => ({ ...current, [section]: value }));
  const toggle = (section: string, value: boolean) =>
    setOpen((current) => (current[section] === value ? current : { ...current, [section]: value }));

  useEffect(() => {
    if (!open.diary || timeline !== null) {
      return;
    }
    let active = true;
    setTimelineBusy(true);
    setFeedback((current) => ({ ...current, diary: null }));
    void fetchTimeline(dog.id, "desc")
      .then((items) => {
        if (active) {
          setTimeline(items.slice(0, 3));
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setFeedback((current) => ({
            ...current,
            diary: { error: true, text: translateApiError(error, "No pudimos cargar el diario.") },
          }));
        }
      })
      .finally(() => {
        if (active) {
          setTimelineBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [dog.id, open.diary, timeline, timelineAttempt]);

  async function saveData(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      tell("data", { error: true, text: "Escribe el nombre de tu perro" });
      return;
    }
    setBusy("data");
    tell("data", null);
    try {
      const saved = await updateDog(dog.id, {
        name: name.trim(),
        breed: trimToNull(breed),
        notes: trimToNull(notes),
      });
      onPatch({ name: saved.name, breed: saved.breed, notes: saved.notes });
      tell("data", { text: "Datos guardados" });
    } catch (error) {
      tell("data", { error: true, text: translateApiError(error, "No pudimos guardar los datos.") });
    } finally {
      setBusy(null);
    }
  }
  async function saveCharacter(event: FormEvent) {
    event.preventDefault();
    if (!profile.size || !profile.temperament || !profile.energy) {
      tell("character", { error: true, text: "Elige tamaño, temperamento y energía" });
      return;
    }
    setBusy("character");
    tell("character", null);
    try {
      const saved = await saveDogProfile(dog.id, {
        ...profile,
        allergies: trimToNull(profile.allergies ?? ""),
        medicalNotes: trimToNull(profile.medicalNotes ?? ""),
        vetContact: dog.profile?.vetContact ?? null,
        emergencyContact: dog.profile?.emergencyContact ?? null,
      });
      onPatch({ profile: saved });
      tell("character", { text: "Ficha guardada" });
    } catch (error) {
      tell("character", { error: true, text: translateApiError(error, "No pudimos guardar la ficha.") });
    } finally {
      setBusy(null);
    }
  }
  async function suggest(firstPhoto: File, version: number) {
    try {
      const traits = await suggestDogTraits(dog.id, await resizeImage(firstPhoto));
      if (version === suggestionVersion.current && (traits.breed || traits.size)) {
        setSuggestion(traits);
      }
    } catch {
      /* Suggestions are optional; enrollment has already succeeded. */
    }
  }
  async function savePhotos(event: FormEvent) {
    event.preventDefault();
    const first = photos[0];
    if (photos.length !== 3 || !first) {
      tell("photos", { error: true, text: "Elige exactamente 3 fotos" });
      return;
    }
    setBusy("photos");
    tell("photos", null);
    setSuggestion(null);
    const version = ++suggestionVersion.current;
    try {
      await enrollPhotos(dog.id, photos);
      onPatch({ hasPhotos: true });
      tell("photos", { text: `Listo, ya reconocemos a ${dog.name}` });
      setPhotos([]);
      if (photoInput.current) {
        photoInput.current.value = "";
      }
      void suggest(first, version);
    } catch (error) {
      tell("photos", { error: true, text: translateApiError(error, "No pudimos guardar las fotos.") });
    } finally {
      setBusy(null);
    }
  }
  async function applySuggestion() {
    if (!suggestion) {
      return;
    }
    setBusy("suggestion");
    tell("suggestion", null);
    try {
      if (suggestion.breed) {
        const saved = await updateDog(dog.id, { breed: suggestion.breed });
        onPatch({ breed: saved.breed });
        setBreed(saved.breed ?? "");
      }
      const size = suggestion.size;
      if (size) {
        setProfile((current) => ({ ...current, size }));
        toggle("character", true);
      }
      setSuggestion(null);
    } catch (error) {
      tell("suggestion", {
        error: true,
        text: translateApiError(error, "No pudimos aplicar la sugerencia."),
      });
    } finally {
      setBusy(null);
    }
  }
  async function remove() {
    setBusy("delete");
    tell("delete", null);
    try {
      await deleteDog(dog.id);
      onDelete();
    } catch (error) {
      tell("delete", { error: true, text: translateApiError(error, "No pudimos eliminar a tu perro.") });
    } finally {
      setBusy(null);
    }
  }
  const sectionProps = (key: string) => ({
    open: Boolean(open[key]),
    onToggle: (value: boolean) => toggle(key, value),
  });
  return (
    <section className="glass dogs__card dogs__ficha" aria-label={`Ficha de ${dog.name}`}>
      <button type="button" className="dogs__button dogs__back" onClick={onBack}>
        ← Volver
      </button>
      <header className="dogs__identity">
        <span className="home__chip-icon dogs__initial dogs__initial--large" aria-hidden="true">
          {dog.name.charAt(0).toLocaleUpperCase("es")}
        </span>
        <div>
          <h2 className="home__card-title">{dog.name}</h2>
          {dog.breed ? <p>{dog.breed}</p> : null}
          <StatusChips dog={dog} />
        </div>
      </header>
      <Section title="Datos" summary={dog.breed ?? "Nombre e indicaciones"} {...sectionProps("data")}>
        <form className="dogs__form" onSubmit={saveData}>
          <div className="dogs__field">
            <label htmlFor="dog-name">Nombre</label>
            <input
              className="dogs__input"
              id="dog-name"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="dogs__field">
            <label htmlFor="dog-breed">Raza</label>
            <input
              className="dogs__input"
              id="dog-breed"
              maxLength={80}
              value={breed}
              onChange={(event) => setBreed(event.target.value)}
            />
          </div>
          <div className="dogs__field">
            <label htmlFor="dog-notes">Indicaciones para el paseador</label>
            <textarea
              className="dogs__input"
              id="dog-notes"
              maxLength={1000}
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Le dan miedo las motos; no lo sueltes en el parque…"
              aria-describedby="dog-notes-count"
            />
            <span id="dog-notes-count" className="dogs__counter">
              {notes.length}/1000
            </span>
          </div>
          <button className="home__cta" disabled={busy !== null}>
            Guardar
          </button>
          <FeedbackLine value={feedback.data ?? null} />
        </form>
      </Section>
      <Section
        title="Carácter y salud"
        summary={complete(dog) ? "Ficha completa" : "Ficha incompleta"}
        {...sectionProps("character")}
      >
        <form className="dogs__form" onSubmit={saveCharacter}>
          <Choice
            name="Tamaño"
            options={SIZES}
            value={profile.size}
            onChange={(size) => setProfile((current) => ({ ...current, size }))}
          />
          <Choice
            name="Temperamento"
            options={TEMPERAMENTS}
            value={profile.temperament}
            onChange={(temperament) => setProfile((current) => ({ ...current, temperament }))}
          />
          <Choice
            name="Energía"
            options={ENERGIES}
            value={profile.energy}
            onChange={(energy) => setProfile((current) => ({ ...current, energy }))}
          />
          <label className="dogs__switch" htmlFor="dog-leash">
            <input
              id="dog-leash"
              type="checkbox"
              role="switch"
              checked={profile.leashTrained}
              onChange={(event) =>
                setProfile((current) => ({ ...current, leashTrained: event.target.checked }))
              }
            />
            <span aria-hidden="true" />
            Camina bien con correa
          </label>
          <div className="dogs__field">
            <label htmlFor="dog-allergies">Alergias</label>
            <input
              className="dogs__input"
              id="dog-allergies"
              maxLength={500}
              value={profile.allergies ?? ""}
              onChange={(event) => setProfile((current) => ({ ...current, allergies: event.target.value }))}
            />
          </div>
          <div className="dogs__field">
            <label htmlFor="dog-medical">Notas médicas</label>
            <input
              className="dogs__input"
              id="dog-medical"
              maxLength={500}
              value={profile.medicalNotes ?? ""}
              onChange={(event) =>
                setProfile((current) => ({ ...current, medicalNotes: event.target.value }))
              }
            />
          </div>
          <p className="home__note">
            Los contactos de emergencia y del veterinario están en tu Perfil{" "}
            <button type="button" className="dogs__button" onClick={() => onGo?.("profile")}>
              Ir a Perfil
            </button>
          </p>
          <button className="home__cta" disabled={busy !== null}>
            Guardar
          </button>
          <FeedbackLine value={feedback.character ?? null} />
        </form>
      </Section>
      <Section
        title="Fotos de reconocimiento"
        summary={dog.hasPhotos ? "Listas" : "Faltan"}
        {...sectionProps("photos")}
      >
        <p>
          Sube 3 fotos claras de {dog.name} (de frente, de lado y de cuerpo entero). Sirven para que el
          paseador confirme que es tu perro al recogerlo.
        </p>
        <form className="dogs__form" onSubmit={savePhotos}>
          <div className="dogs__field">
            <label htmlFor="dog-photos">Fotos de referencia (3)</label>
            <input
              ref={photoInput}
              className="dogs__input"
              id="dog-photos"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                setPhotos(Array.from(event.target.files ?? []));
                tell("photos", null);
              }}
            />
          </div>
          <button className="home__cta" disabled={busy !== null}>
            Guardar fotos
          </button>
          <FeedbackLine value={feedback.photos ?? null} />
        </form>
        {suggestion ? (
          <aside className="home__note dogs__suggestion" aria-label="Sugerencia de la IA">
            <p>
              La IA cree que es{" "}
              <strong>{[suggestion.breed, sizeLabel(suggestion.size)].filter(Boolean).join(" · ")}</strong>
            </p>
            <div className="dogs__actions">
              <button
                type="button"
                className="home__cta"
                disabled={busy !== null}
                onClick={() => void applySuggestion()}
              >
                Usar
              </button>
              <button
                type="button"
                className="dogs__button"
                disabled={busy !== null}
                onClick={() => setSuggestion(null)}
              >
                Descartar
              </button>
            </div>
            <FeedbackLine value={feedback.suggestion ?? null} />
          </aside>
        ) : null}
      </Section>
      <Section title="Diario" summary="Últimos paseos" {...sectionProps("diary")}>
        {timelineBusy ? (
          <div className="home__card-loader">
            <DogLoader label="Cargando el diario…" />
          </div>
        ) : null}
        <FeedbackLine value={feedback.diary ?? null} />
        {feedback.diary?.error ? (
          <button
            type="button"
            className="dogs__button"
            onClick={() => setTimelineAttempt((current) => current + 1)}
          >
            Reintentar
          </button>
        ) : null}
        {timeline?.length === 0 ? <p>Todavía no hay paseos de {dog.name}</p> : null}
        {timeline && timeline.length > 0 ? (
          <ul className="dogs__diary">
            {timeline.map((item) => (
              <li
                className="home__row"
                key={item.type === "walk" ? `walk-${item.requestId}` : `checkout-${item.checkoutId}`}
              >
                <span className="home__chip-icon" aria-hidden="true">
                  <PawLineIcon />
                </span>
                <span className="home__row-text">
                  <strong>
                    {item.type === "walk" ? "Paseo con" : "Reporte de"} {item.walkerName ?? "tu paseador"}
                  </strong>
                  {item.type === "walk" ? (
                    <time dateTime={item.requestedTime}>{formatWhenBogota(item.requestedTime)}</time>
                  ) : (
                    <span>
                      {item.note && item.note.length > 160 ? `${item.note.slice(0, 160)}…` : item.note}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" className="dogs__button" onClick={() => onGo?.("walks")}>
          Ver todos en Paseos
        </button>
      </Section>
      <Section title="Eliminar perro" summary="Acción permanente" {...sectionProps("delete")}>
        {confirmDelete ? (
          <>
            <p>¿Eliminar a {dog.name}? Esta acción no se puede deshacer.</p>
            <div className="dogs__actions">
              <button
                type="button"
                className="dogs__button dogs__danger"
                disabled={busy !== null}
                onClick={() => void remove()}
              >
                Sí, eliminar
              </button>
              <button
                type="button"
                className="dogs__button"
                disabled={busy !== null}
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="dogs__button dogs__danger" onClick={() => setConfirmDelete(true)}>
            Eliminar perro
          </button>
        )}
        <FeedbackLine value={feedback.delete ?? null} />
      </Section>
    </section>
  );
}

export function OwnerDogsScreen({ onGo }: { onGo?: (tab: string) => void }) {
  const screenRef = useOwnerDogsScreenMount();
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchDogs()
      .then((loaded) => {
        if (active) {
          setDogs(loaded);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(translateApiError(cause, "No pudimos cargar tus perros."));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const selected = dogs.find((dog) => dog.id === selectedId);
  return (
    <section ref={screenRef} className="dogs oglass" data-cantrack-owner-dogs-screen>
      <header className="home__greeting">
        <h1 className="home__title">Mis perros</h1>
        <p className="home__subtitle">La ficha de cada peludo para que el paseador lo cuide bien</p>
      </header>
      <div className={`dogs__layout${selected ? " dogs__layout--selected" : ""}`}>
        <div className="dogs__sidebar">
          <section className="glass home__list" aria-label="Tus perros">
            <h2 className="home__card-title">Tus perros</h2>
            {loading ? (
              <div className="home__card-loader">
                <DogLoader label="Cargando tus perros…" />
              </div>
            ) : error ? (
              <>
                <p role="alert">{error}</p>
                <button
                  type="button"
                  className="dogs__button"
                  onClick={() => setAttempt((current) => current + 1)}
                >
                  Reintentar
                </button>
              </>
            ) : dogs.length === 0 ? (
              <p>Aún no tienes perros. Agrega el primero para pedir paseos.</p>
            ) : (
              <ul>
                {dogs.map((dog) => (
                  <li key={dog.id}>
                    <button
                      type="button"
                      className="home__row dogs__dog-row"
                      aria-current={dog.id === selectedId ? "true" : undefined}
                      onClick={() => {
                        setSelectedId(dog.id);
                        setPhotosOpen(false);
                        setAdding(false);
                      }}
                    >
                      <span className="home__chip-icon dogs__initial" aria-hidden="true">
                        {dog.name.charAt(0).toLocaleUpperCase("es")}
                      </span>
                      <span className="home__row-text">
                        <strong>{dog.name}</strong>
                        <span>{[dog.breed, sizeLabel(dog.profile?.size)].filter(Boolean).join(" · ")}</span>
                        <StatusChips dog={dog} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <button type="button" className="home__cta" onClick={() => setAdding(true)}>
            Agregar perro
          </button>
          {adding ? (
            <AddDog
              onCancel={() => setAdding(false)}
              onCreated={(dog) => {
                setDogs((current) => [...current, dog]);
                setSelectedId(dog.id);
                setPhotosOpen(true);
                setAdding(false);
              }}
            />
          ) : null}
        </div>
        {selected ? (
          <DogFicha
            key={selected.id}
            dog={selected}
            photosOpen={photosOpen}
            onGo={onGo}
            onBack={() => setSelectedId(null)}
            onPatch={(patch) =>
              setDogs((current) =>
                current.map((dog) => (dog.id === selected.id ? { ...dog, ...patch } : dog)),
              )
            }
            onDelete={() => {
              setDogs((current) => current.filter((dog) => dog.id !== selected.id));
              setSelectedId(null);
            }}
          />
        ) : dogs.length > 0 ? (
          <div className="glass dogs__card dogs__placeholder">Elige un perro para ver su ficha</div>
        ) : null}
      </div>
    </section>
  );
}
