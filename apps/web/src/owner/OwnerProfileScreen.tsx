import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { AccountSettings, accountError } from "../account/AccountSettings.js";
import { ApiError } from "../lib/apiError.js";
import { resizeImage } from "../lib/image.js";
import { saveHomePoint } from "../lib/homePoint.js";
import {
  fetchOwnerProfile,
  recordOwnerConsent,
  saveOwnerProfile,
  setFavoriteWalker,
  uploadOwnerAvatar,
  type HandoffMethod,
  type OwnerNotifications,
  type OwnerProfile,
  type OwnerProfileInput,
  type PaymentMethod,
} from "../lib/marketplace.js";
import { PickupMap } from "../map/PickupMap.js";
import { parsePin } from "../map/pasto.js";
import { Avatar } from "../ui/Avatar.js";
import { DogLoader } from "../ui/DogLoader.js";
import "./explore.css";
import "./owner-glass.css";
import "./owner-profile.css";

const PHONE = /^\+?\d[\d ]{6,19}$/;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const LONG_MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const HANDOFF: { id: HandoffMethod; label: string }[] = [
  { id: "in_person", label: "En persona" },
  { id: "doorman", label: "En portería" },
  { id: "key", label: "Con llave" },
];

const PAYMENT: { id: PaymentMethod; label: string }[] = [
  { id: "cash", label: "Efectivo" },
  { id: "nequi", label: "Nequi" },
  { id: "card", label: "Tarjeta" },
];

const NOTIFY: { id: keyof OwnerNotifications; label: string; hint: string }[] = [
  { id: "walkStarted", label: "Paseo iniciado", hint: "Cuando el paseador recoge a tu perro" },
  { id: "report", label: "Fotos y reporte", hint: "Cuando llega el reporte del paseo" },
  { id: "walkDone", label: "Paseo terminado", hint: "Cuando tu perro vuelve a casa" },
  { id: "offers", label: "Ofertas nuevas", hint: "Cuando un paseador ofrece por tu solicitud" },
];

const DEFAULT_NOTIFICATIONS: OwnerNotifications = { walkStarted: true, report: true, walkDone: true, offers: true };

function consentDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function memberSince(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : `Miembro desde ${LONG_MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}

type Feedback = { tone: "ok" | "error"; text: string } | null;

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (feedback === null) {
    return null;
  }
  return feedback.tone === "ok" ? (
    <p className="explore__notice" role="status">{feedback.text}</p>
  ) : (
    <p className="explore__error" role="alert">{feedback.text}</p>
  );
}

function Section({ title, summary, children, defaultOpen = false }: { title: string; summary: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="glass oprofile__section" open={defaultOpen}>
      <summary className="oprofile__summary">
        <span className="oprofile__summary-title">{title}</span>
        <span className="oprofile__summary-value">{summary}</span>
        <span className="oprofile__chevron" aria-hidden="true" />
      </summary>
      <div className="oprofile__body">{children}</div>
    </details>
  );
}

function Choice<T extends string>({ name, options, value, onChange }: { name: string; options: { id: T; label: string }[]; value: T | null; onChange: (next: T) => void }) {
  return (
    <div className="explore__segments" role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className="explore__segment"
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Fill the sections an older API (or a partial answer) leaves out, so a
 * missing list or flag never breaks the whole screen.
 */
function withDefaults(raw: OwnerProfile): OwnerProfile {
  const partial = raw as Partial<OwnerProfile> & Pick<OwnerProfile, "ownerId" | "email">;
  return {
    ...partial,
    emailVerified: partial.emailVerified ?? false,
    memberSince: partial.memberSince ?? null,
    displayName: partial.displayName ?? null,
    phone: partial.phone ?? null,
    avatarUrl: partial.avatarUrl ?? null,
    home: partial.home ?? null,
    pickupNotes: partial.pickupNotes ?? null,
    handoff: partial.handoff ?? null,
    emergency: partial.emergency ?? null,
    vet: partial.vet ?? null,
    paymentMethod: partial.paymentMethod ?? null,
    notifications: { ...DEFAULT_NOTIFICATIONS, ...partial.notifications },
    consent: partial.consent ?? null,
    stats: partial.stats ?? { dogs: 0, walksDone: 0 },
    dogs: partial.dogs ?? [],
    walkers: partial.walkers ?? [],
  };
}

export type OwnerProfileScreenProps = {
  userId: string;
  onSignOut: (scope?: "global") => void;
  /** Jump to another tab (Mis perros, Paseos). */
  onGo?: (tab: string) => void;
};

/** Perfil (owner): who you are, where the dog is picked up, who to call, how you pay, what you hear about, and the account. */
export function OwnerProfileScreen({ userId, onSignOut, onGo }: OwnerProfileScreenProps) {
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [homeLabel, setHomeLabel] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");
  const [handoff, setHandoff] = useState<HandoffMethod | null>(null);
  const [emName, setEmName] = useState("");
  const [emRelation, setEmRelation] = useState("");
  const [emPhone, setEmPhone] = useState("");
  const [vetName, setVetName] = useState("");
  const [vetPhone, setVetPhone] = useState("");

  function apply(raw: OwnerProfile) {
    const next = withDefaults(raw);
    setProfile(next);
    setName(next.displayName ?? "");
    setPhone(next.phone ?? "");
    setHomeLabel(next.home?.label ?? "");
    setLat(next.home ? String(next.home.lat) : "");
    setLng(next.home ? String(next.home.lng) : "");
    setPickupNotes(next.pickupNotes ?? "");
    setHandoff(next.handoff);
    setEmName(next.emergency?.name ?? "");
    setEmRelation(next.emergency?.relation ?? "");
    setEmPhone(next.emergency?.phone ?? "");
    setVetName(next.vet?.name ?? "");
    setVetPhone(next.vet?.phone ?? "");
    saveHomePoint(next.home ? { lat: next.home.lat, lng: next.home.lng } : null);
  }

  useEffect(() => {
    let isMounted = true;
    fetchOwnerProfile(userId)
      .then((loaded) => isMounted && apply(loaded))
      .catch((error: unknown) => isMounted && setLoadError(accountError(error, "No pudimos cargar tu perfil.")));
    return () => {
      isMounted = false;
    };
  }, [userId, attempt]);

  function say(key: string, next: Feedback) {
    setFeedback((current) => ({ ...current, [key]: next }));
  }

  /** Save one section; `problems` are the client-side checks that failed. */
  async function saveSection(key: string, input: OwnerProfileInput, problems: string[], ok: string) {
    if (problems.length > 0) {
      say(key, { tone: "error", text: problems.join(" · ") });
      return;
    }
    say(key, null);
    setSaving(key);
    try {
      apply(await saveOwnerProfile(userId, input));
      say(key, { tone: "ok", text: ok });
    } catch (failure: unknown) {
      say(key, { tone: "error", text: accountError(failure, "No pudimos guardar los cambios.") });
    } finally {
      setSaving(null);
    }
  }

  function submit(handler: () => void) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      handler();
    };
  }

  function saveData() {
    const problems: string[] = [];
    if (name.trim().length < 1 || name.trim().length > 80) problems.push("Escribe tu nombre (máx. 80)");
    if (phone.trim() !== "" && !PHONE.test(phone.trim())) problems.push("Teléfono no válido");
    void saveSection("data", { displayName: name.trim(), phone: phone.trim() || null }, problems, "Guardamos tus datos.");
  }

  function savePickup() {
    const problems: string[] = [];
    const pin = parsePin(lat, lng);
    if (homeLabel.trim().length > 120 || (homeLabel.trim() !== "" && pin === null)) problems.push("Marca el punto en el mapa");
    if (pickupNotes.trim().length > 300) problems.push("Las indicaciones van hasta 300 caracteres");
    void saveSection(
      "pickup",
      {
        home: pin !== null ? { lat: pin.lat, lng: pin.lng, label: homeLabel.trim() || "Casa" } : null,
        pickupNotes: pickupNotes.trim() || null,
        handoff,
      },
      problems,
      "Guardamos dónde recoger a tu perro.",
    );
  }

  function saveEmergency() {
    const problems: string[] = [];
    const hasContact = emName.trim() !== "" || emPhone.trim() !== "";
    if (hasContact && emName.trim() === "") problems.push("Falta el nombre del contacto");
    if (hasContact && !PHONE.test(emPhone.trim())) problems.push("Teléfono del contacto no válido");
    if (vetPhone.trim() !== "" && vetName.trim() === "") problems.push("Falta el nombre del veterinario");
    if (vetPhone.trim() !== "" && !PHONE.test(vetPhone.trim())) problems.push("Teléfono del veterinario no válido");
    void saveSection(
      "emergency",
      {
        emergency: hasContact ? { name: emName.trim(), relation: emRelation.trim(), phone: emPhone.trim() } : null,
        vet: vetName.trim() !== "" ? { name: vetName.trim(), phone: vetPhone.trim() || null } : null,
      },
      problems,
      "Guardamos tus contactos de emergencia.",
    );
  }

  async function quickSave(key: string, input: OwnerProfileInput, optimistic: OwnerProfile) {
    const previous = profile;
    setProfile(optimistic);
    say(key, null);
    try {
      setProfile(withDefaults(await saveOwnerProfile(userId, input, true)));
    } catch (failure: unknown) {
      setProfile(previous);
      say(key, { tone: "error", text: accountError(failure, "No pudimos guardar el cambio.") });
    }
  }

  async function toggleFavorite(walkerId: string, favorite: boolean) {
    say("favorites", null);
    try {
      setProfile(withDefaults(await setFavoriteWalker(userId, walkerId, favorite)));
    } catch (failure: unknown) {
      say("favorites", { tone: "error", text: accountError(failure, "No pudimos actualizar tus favoritos.") });
    }
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) {
      return;
    }
    setPhotoError(null);
    try {
      const { avatarUrl } = await uploadOwnerAvatar(userId, await resizeImage(file));
      setProfile((current) => (current === null ? current : { ...current, avatarUrl }));
    } catch (failure: unknown) {
      setPhotoError(
        failure instanceof ApiError && failure.status === 413
          ? "La foto pesa más de 2 MB"
          : failure instanceof ApiError && failure.status === 400
            ? "No pudimos leer esa imagen"
            : accountError(failure, "No pudimos subir la foto."),
      );
    }
  }

  async function acceptConsent() {
    try {
      const consent = await recordOwnerConsent(userId);
      setProfile((current) => (current === null ? current : { ...current, consent }));
    } catch (failure: unknown) {
      say("privacy", { tone: "error", text: accountError(failure, "No pudimos guardar tu consentimiento.") });
    }
  }

  if (profile === null) {
    return (
      <div className="explore oglass oprofile">
        {loadError !== null ? (
          <div className="glass oglass__retry">
            <p className="explore__error" role="alert">{loadError}</p>
            <button type="button" className="explore__small explore__small--lime" onClick={() => { setLoadError(null); setAttempt((n) => n + 1); }}>
              Reintentar
            </button>
          </div>
        ) : (
          <DogLoader label="Cargando tu perfil…" pose="walk" />
        )}
      </div>
    );
  }

  const since = memberSince(profile.memberSince);
  const favorites = profile.walkers.filter((walker) => walker.favorite).length;
  const notifyOn = NOTIFY.filter((item) => profile.notifications[item.id]).length;
  const paymentLabel = PAYMENT.find((item) => item.id === profile.paymentMethod)?.label;

  return (
    <div className="explore oglass oprofile">
      <section className="glass oprofile__hero" aria-label="Tu perfil">
        <div className="oprofile__photo">
          <Avatar src={profile.avatarUrl ?? undefined} alt={profile.displayName ?? "Tu foto de perfil"} size={96} />
          <label className="oprofile__photo-btn" htmlFor="owner-avatar">Cambiar foto</label>
          <input id="owner-avatar" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickPhoto(e)} />
        </div>
        <div className="oprofile__who">
          <h1 className="explore__title">{profile.displayName ?? "Tu perfil"}</h1>
          {since !== null ? <p className="oprofile__since">{since}</p> : null}
          <ul className="oprofile__badges" aria-label="Verificación">
            <li data-on={profile.emailVerified}>{profile.emailVerified ? "Correo verificado" : "Correo sin verificar"}</li>
            <li data-on={profile.phone !== null}>{profile.phone !== null ? "Teléfono agregado" : "Sin teléfono"}</li>
            <li data-on={profile.emergency !== null}>{profile.emergency !== null ? "Contacto de emergencia" : "Sin contacto de emergencia"}</li>
          </ul>
        </div>
        <dl className="oprofile__stats">
          <div><dt>Perros</dt><dd>{profile.stats.dogs}</dd></div>
          <div><dt>Paseos hechos</dt><dd>{profile.stats.walksDone}</dd></div>
          <div><dt>Favoritos</dt><dd>{favorites}</dd></div>
        </dl>
        <div className="oprofile__dogs">
          {profile.dogs.map((dog) => (
            <button key={dog.id} type="button" className="oprofile__dog" onClick={() => onGo?.("dogs")} title={dog.breed ?? undefined}>
              <span className="oprofile__dog-initial" aria-hidden="true">{dog.name.slice(0, 1).toUpperCase()}</span>
              {dog.name}
            </button>
          ))}
          <button type="button" className="oprofile__dog oprofile__dog--add" onClick={() => onGo?.("dogs")}>
            {profile.dogs.length === 0 ? "Agrega tu primer perro" : "Ver mis perros"}
          </button>
        </div>
        {photoError !== null ? <p className="explore__error" role="alert">{photoError}</p> : null}
      </section>

      {profile.displayName === null ? (
        <p className="explore__notice" role="status">Completa tu perfil: dinos cómo te llamas.</p>
      ) : null}

      <Section title="Tus datos" summary={profile.phone ?? profile.email} defaultOpen={profile.displayName === null}>
        <form onSubmit={submit(saveData)} noValidate aria-label="Tus datos">
          <div className="explore__field">
            <label className="explore__label" htmlFor="owner-name">Nombre</label>
            <input id="owner-name" className="explore__input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div className="explore__field">
            <label className="explore__label" htmlFor="owner-phone">Teléfono</label>
            <input id="owner-phone" className="explore__input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+57 300 123 4567" />
            <span className="explore__hint">El paseador lo ve solo cuando tiene un paseo contigo.</span>
          </div>
          <div className="explore__field">
            <label className="explore__label" htmlFor="owner-email">Correo</label>
            <input id="owner-email" className="explore__input" value={profile.email} readOnly />
          </div>
          <FeedbackLine feedback={feedback.data ?? null} />
          <button type="submit" className="explore__cta" disabled={saving === "data"}>{saving === "data" ? "Guardando…" : "Guardar"}</button>
        </form>
      </Section>

      <Section title="Recogida y acceso" summary={profile.home?.label ?? "Sin dirección"}>
        <form onSubmit={submit(savePickup)} noValidate aria-label="Recogida y acceso">
          <div className="explore__field">
            <label className="explore__label" htmlFor="owner-home">Dónde recogen a tu perro</label>
            <input id="owner-home" className="explore__input" value={homeLabel} placeholder="Casa, Las Cuadras" onChange={(e) => setHomeLabel(e.target.value)} />
          </div>
          <PickupMap lat={lat} lng={lng} onPick={(a, b) => { setLat(String(a)); setLng(String(b)); }} />
          <div className="explore__field oprofile__gap">
            <label className="explore__label" htmlFor="owner-notes">Indicaciones para llegar</label>
            <textarea id="owner-notes" className="explore__input oprofile__textarea" rows={3} maxLength={300} value={pickupNotes} placeholder="Portería, torre 3, apto 502. El timbre no sirve, llama al llegar." onChange={(e) => setPickupNotes(e.target.value)} />
            <span className="explore__hint">{pickupNotes.length}/300</span>
          </div>
          <div className="explore__field">
            <span className="explore__label" id="handoff-label">Cómo entregas a tu perro</span>
            <Choice name="Cómo entregas a tu perro" options={HANDOFF} value={handoff} onChange={setHandoff} />
          </div>
          <FeedbackLine feedback={feedback.pickup ?? null} />
          <button type="submit" className="explore__cta" disabled={saving === "pickup"}>{saving === "pickup" ? "Guardando…" : "Guardar"}</button>
        </form>
      </Section>

      <Section title="Emergencias" summary={profile.emergency?.name ?? "Sin contacto"}>
        <form onSubmit={submit(saveEmergency)} noValidate aria-label="Emergencias">
          <p className="explore__hint">Si no contestas durante un paseo, el paseador llamará a esta persona.</p>
          <div className="explore__field">
            <label className="explore__label" htmlFor="em-name">Nombre del contacto</label>
            <input id="em-name" className="explore__input" value={emName} onChange={(e) => setEmName(e.target.value)} autoComplete="off" />
          </div>
          <div className="oprofile__row">
            <div className="explore__field">
              <label className="explore__label" htmlFor="em-relation">Parentesco</label>
              <input id="em-relation" className="explore__input" value={emRelation} placeholder="Hermana" maxLength={40} onChange={(e) => setEmRelation(e.target.value)} />
            </div>
            <div className="explore__field">
              <label className="explore__label" htmlFor="em-phone">Teléfono</label>
              <input id="em-phone" className="explore__input" type="tel" value={emPhone} onChange={(e) => setEmPhone(e.target.value)} />
            </div>
          </div>
          <h3 className="oprofile__sub">Veterinario de confianza</h3>
          <div className="oprofile__row">
            <div className="explore__field">
              <label className="explore__label" htmlFor="vet-name">Clínica o veterinario</label>
              <input id="vet-name" className="explore__input" value={vetName} maxLength={80} onChange={(e) => setVetName(e.target.value)} />
            </div>
            <div className="explore__field">
              <label className="explore__label" htmlFor="vet-phone">Teléfono</label>
              <input id="vet-phone" className="explore__input" type="tel" value={vetPhone} onChange={(e) => setVetPhone(e.target.value)} />
            </div>
          </div>
          <FeedbackLine feedback={feedback.emergency ?? null} />
          <button type="submit" className="explore__cta" disabled={saving === "emergency"}>{saving === "emergency" ? "Guardando…" : "Guardar"}</button>
        </form>
      </Section>

      <Section title="Pagos" summary={paymentLabel ?? "Sin elegir"}>
        <div className="explore__field">
          <span className="explore__label">Cómo prefieres pagar</span>
          <Choice
            name="Cómo prefieres pagar"
            options={PAYMENT}
            value={profile.paymentMethod}
            onChange={(next) => void quickSave("payment", { paymentMethod: next }, { ...profile, paymentMethod: next })}
          />
        </div>
        <FeedbackLine feedback={feedback.payment ?? null} />
        <button type="button" className="explore__small" onClick={() => onGo?.("walks")}>Ver pagos de mis paseos</button>
      </Section>

      <Section title="Avisos" summary={`${notifyOn} de ${NOTIFY.length} activos`}>
        <ul className="oprofile__toggles">
          {NOTIFY.map((item) => (
            <li key={item.id}>
              <label className="oprofile__toggle">
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={profile.notifications[item.id]}
                  onChange={(e) => {
                    const notifications = { ...profile.notifications, [item.id]: e.target.checked };
                    void quickSave("notify", { notifications }, { ...profile, notifications });
                  }}
                />
              </label>
            </li>
          ))}
        </ul>
        <FeedbackLine feedback={feedback.notify ?? null} />
      </Section>

      <Section title="Paseadores favoritos" summary={favorites === 0 ? "Ninguno" : `${favorites}`}>
        {profile.walkers.length === 0 ? (
          <p className="explore__empty">Cuando termines tu primer paseo, aquí podrás guardar a tu paseador favorito.</p>
        ) : (
          <ul className="explore__list">
            {profile.walkers.map((walker) => (
              <li key={walker.walkerId} className="explore__offer">
                <div className="explore__offer-main">
                  <strong>{walker.name ?? "Paseador"}</strong>
                  <span>{walker.walks === 1 ? "1 paseo contigo" : `${walker.walks} paseos contigo`}</span>
                </div>
                <button
                  type="button"
                  className={walker.favorite ? "explore__small explore__small--lime" : "explore__small"}
                  aria-pressed={walker.favorite}
                  onClick={() => void toggleFavorite(walker.walkerId, !walker.favorite)}
                >
                  {walker.favorite ? "★ Favorito" : "☆ Marcar favorito"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <FeedbackLine feedback={feedback.favorites ?? null} />
      </Section>

      <Section title="Privacidad y cuenta" summary={profile.consent !== null ? "Política aceptada" : "Falta aceptar la política"}>
        {profile.consent !== null ? (
          <p className="explore__hint">
            Aceptaste la política de datos ({profile.consent.version}) el {consentDate(profile.consent.at)}
          </p>
        ) : (
          <>
            <p className="explore__hint">Aún no has aceptado el tratamiento de datos personales.</p>
            <button type="button" className="explore__small explore__small--lime" onClick={() => void acceptConsent()}>
              Acepto el tratamiento de datos
            </button>
          </>
        )}
        <FeedbackLine feedback={feedback.privacy ?? null} />
        <div className="oprofile__account">
          <AccountSettings role="owner" userId={userId} onSignOut={onSignOut} />
        </div>
      </Section>
    </div>
  );
}
