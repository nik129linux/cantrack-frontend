import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { AccountSettings, accountError } from "../account/AccountSettings.js";
import { ApiError } from "../lib/apiError.js";
import { formatCop, formatWhenBogota } from "../lib/format.js";
import { resizeImage } from "../lib/image.js";
import {
  fetchWalkerAccountProfile,
  fetchWalkerWalks,
  recordWalkerConsent,
  saveWalkerAccountProfile,
  uploadWalkerAvatar,
  type DogSize,
  type WalkTab,
  type WalkerAccountProfile,
  type WalkerHistoryItem,
  type WalkerReview,
} from "../lib/marketplace.js";
import { DOG_SIZES, experienceLabel, sizesLabel, walksLabel } from "../lib/walkerCard.js";
import { Avatar } from "../ui/Avatar.js";
import { DogLoader } from "../ui/DogLoader.js";
import "../owner/explore.css";
import "../owner/owner-glass.css";
import "../owner/owner-profile.css";
import "./walker-glass.css";
import "./walker-profile.css";

const PHONE = /^\+?[\d ]{7,20}$/;
const SAVE_FIRST = "Guarda tu perfil primero";
const TOP_RATED = 4.5;
const TOP_RATED_MIN = 3;
const NEW_WALKER = 5;

const TABS: { id: WalkTab; label: string }[] = [
  { id: "upcoming", label: "Programados" },
  { id: "active", label: "En curso" },
  { id: "past", label: "Pasados" },
];

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const LONG_MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function memberSince(iso: string | null | undefined): string | null {
  if (iso === null || iso === undefined) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : `Paseador desde ${LONG_MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}

function hoursLabel(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(".", ",");
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="wprofile__stars" role="img" aria-label={`${value} de 5 estrellas`}>
      {"★".repeat(full)}
      <span className="wprofile__stars-off">{"★".repeat(5 - full)}</span>
    </span>
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

type Draft = {
  name: string;
  bio: string;
  area: string;
  price: string;
  phone: string;
  years: string;
  sizes: DogSize[];
};

/** What is still missing to look trustworthy to an owner, in the order they read it. */
function missingItems(profile: WalkerAccountProfile, draft: Draft): string[] {
  const checks: [boolean, string][] = [
    [draft.name.trim() !== "", "Tu nombre"],
    [profile.avatarUrl !== null, "Una foto tuya"],
    [draft.price.trim() !== "", "Tu precio por paseo"],
    [draft.bio.trim() !== "", "Unas líneas sobre ti"],
    [draft.area.trim() !== "", "Tu zona"],
    [draft.years.trim() !== "", "Tu experiencia"],
    [draft.sizes.length > 0, "Los tamaños que paseas"],
    [draft.phone.trim() !== "", "Tu teléfono"],
    [profile.consent !== null, "Aceptar la política de datos"],
  ];
  return checks.filter(([done]) => !done).map(([, label]) => label);
}

const CHECK_COUNT = 9;

/** The offer card exactly as owners read it in Explorar, from what is typed right now. */
function OwnerPreview({ profile, draft }: { profile: WalkerAccountProfile; draft: Draft }) {
  const name = draft.name.trim() === "" ? "Tu nombre" : draft.name.trim();
  const { average, count } = profile.stats.rating;
  const rating = count === 0 || average === null ? "Nuevo" : `★ ${average.toFixed(1)} (${count})`;
  const walks = walksLabel(profile.stats.walksDone);
  const years = draft.years.trim() === "" ? null : Number(draft.years);
  const chips = [
    experienceLabel(years !== null && Number.isFinite(years) ? years : null),
    sizesLabel(draft.sizes),
    draft.area.trim() === "" ? null : draft.area.trim(),
  ].filter((text): text is string => text !== null);
  const price = Number(draft.price);
  return (
    <section className="glass wprofile__preview" aria-label="Así te ven los dueños">
      <div className="wprofile__preview-head">
        <h2 className="oprofile__sub">Así te ven los dueños</h2>
        <p className="explore__hint">Es la tarjeta de tu oferta en Explorar. Se actualiza mientras escribes.</p>
      </div>
      <div className="wprofile__card">
        <Avatar src={profile.avatarUrl ?? undefined} alt="" name={name} size={52} />
        <div className="wprofile__card-main">
          <strong className="wprofile__card-name">{name}</strong>
          <span className="wprofile__card-rating">
            {rating}
            {walks !== null ? ` · ${walks}` : ""}
          </span>
          {draft.bio.trim() !== "" ? (
            <p className="wprofile__card-bio">{draft.bio.trim()}</p>
          ) : (
            <p className="wprofile__card-bio wprofile__card-bio--empty">Aquí va lo que escribas en “Sobre ti”.</p>
          )}
          {chips.length > 0 ? (
            <ul className="wprofile__chips" aria-label="Lo que ven de ti">
              {chips.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <span className="wprofile__card-price">
          {draft.price.trim() !== "" && Number.isFinite(price) ? formatCop(Math.round(price)) : "$ —"}
        </span>
      </div>
    </section>
  );
}

function Reviews({ profile }: { profile: WalkerAccountProfile }) {
  const { count, breakdown } = profile.stats.rating;
  const reviews: WalkerReview[] = profile.reviews ?? [];
  if (count === 0) {
    return <p className="explore__empty">Cuando un dueño califique un paseo, sus estrellas aparecen aquí.</p>;
  }
  const spread = breakdown ?? [0, 0, 0, 0, 0];
  return (
    <>
      <ul className="wprofile__bars" aria-label="Cómo te califican">
        {[5, 4, 3, 2, 1].map((stars) => {
          const n = spread[stars - 1] ?? 0;
          return (
            <li key={stars} aria-label={`${stars} estrellas: ${n}`}>
              <span className="wprofile__bar-label" aria-hidden="true">{stars} ★</span>
              <span className="wprofile__bar" aria-hidden="true">
                <span style={{ width: `${count === 0 ? 0 : (n / count) * 100}%` }} />
              </span>
              <span className="wprofile__bar-count" aria-hidden="true">{n}</span>
            </li>
          );
        })}
      </ul>
      {reviews.length > 0 ? (
        <>
          <h3 className="oprofile__sub">Últimas calificaciones</h3>
          <ul className="wprofile__reviews" aria-label="Últimas calificaciones">
            {reviews.map((review, index) => (
              <li key={`${review.at}-${index}`}>
                <Stars value={review.rating} />
                <span className="wprofile__review-who">
                  {[review.dogName, review.ownerName].filter(Boolean).join(" · ") || "Un paseo"}
                </span>
                <span className="wprofile__review-date">{shortDate(review.at)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

export type WalkerProfileScreenProps = {
  userId: string;
  onSignOut: (scope?: "global") => void;
};

/** Perfil (walker): who owners see, the track record, the ratings, the history and the account. */
export function WalkerProfileScreen({ userId, onSignOut }: WalkerProfileScreenProps) {
  const [profile, setProfile] = useState<WalkerAccountProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft>({ name: "", bio: "", area: "", price: "", phone: "", years: "", sizes: [] });
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [tab, setTab] = useState<WalkTab>("past");
  const [history, setHistory] = useState<WalkerHistoryItem[]>([]);

  function apply(next: WalkerAccountProfile) {
    setProfile(next);
    setDraft({
      name: next.displayName ?? "",
      bio: next.bio ?? "",
      area: next.serviceArea ?? "",
      price: next.pricePerWalk === null ? "" : String(next.pricePerWalk),
      phone: next.phone ?? "",
      years: next.experienceYears === null || next.experienceYears === undefined ? "" : String(next.experienceYears),
      sizes: next.dogSizes ?? [],
    });
  }

  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleSize(size: DogSize) {
    setDraft((current) => ({
      ...current,
      sizes: current.sizes.includes(size) ? current.sizes.filter((s) => s !== size) : [...current.sizes, size],
    }));
  }

  useEffect(() => {
    let isMounted = true;
    fetchWalkerAccountProfile(userId)
      .then((loaded) => isMounted && apply(loaded))
      .catch((failure: unknown) => isMounted && setLoadError(accountError(failure, "No pudimos cargar tu perfil.")));
    return () => {
      isMounted = false;
    };
  }, [userId, attempt]);

  useEffect(() => {
    let isMounted = true;
    fetchWalkerWalks(userId, tab)
      .then((rows) => isMounted && setHistory(rows))
      .catch(() => isMounted && setHistory([]));
    return () => {
      isMounted = false;
    };
  }, [userId, tab]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const found: string[] = [];
    const amount = Number(draft.price);
    const years = Number(draft.years);
    if (draft.name.trim().length < 1 || draft.name.trim().length > 80) {
      found.push("Escribe tu nombre (máx. 80)");
    }
    if (draft.price.trim() === "" || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
      found.push("El precio por paseo debe estar entre $0 y $1.000.000");
    }
    if (draft.bio.length > 500) {
      found.push("La descripción admite máximo 500 caracteres");
    }
    if (draft.area.length > 120) {
      found.push("La zona admite máximo 120 caracteres");
    }
    if (draft.years.trim() !== "" && (!Number.isInteger(years) || years < 0 || years > 50)) {
      found.push("La experiencia va de 0 a 50 años");
    }
    if (draft.phone.trim() !== "" && !PHONE.test(draft.phone.trim())) {
      found.push("Teléfono no válido");
    }
    setErrors(found);
    if (found.length > 0 || profile === null) {
      return;
    }

    const isFirstSave = profile.displayName === null;
    setIsSaving(true);
    try {
      let saved = await saveWalkerAccountProfile(userId, {
        displayName: draft.name.trim(),
        bio: draft.bio.trim() === "" ? null : draft.bio.trim(),
        serviceArea: draft.area.trim() === "" ? null : draft.area.trim(),
        pricePerWalk: Math.round(amount),
        phone: draft.phone.trim() === "" ? null : draft.phone.trim(),
        experienceYears: draft.years.trim() === "" ? null : years,
        dogSizes: DOG_SIZES.map((size) => size.id).filter((id) => draft.sizes.includes(id)),
      });
      // The consent needs a saved profile (409 before it): send it right after the first save.
      if (isFirstSave && accepted) {
        try {
          const consent = await recordWalkerConsent(userId);
          saved = { ...saved, consent };
        } catch {
          // Privacidad shows the consent button again.
        }
      }
      apply(saved);
      setMessage("Guardamos tu perfil.");
    } catch (failure: unknown) {
      setErrors(
        failure instanceof ApiError && failure.status === 400
          ? ["Revisa los datos del formulario."]
          : [accountError(failure, "No pudimos guardar tu perfil.")],
      );
    } finally {
      setIsSaving(false);
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
      const { avatarUrl } = await uploadWalkerAvatar(userId, await resizeImage(file));
      setProfile((current) => (current === null ? current : { ...current, avatarUrl }));
    } catch (failure: unknown) {
      setPhotoError(
        failure instanceof ApiError && failure.status === 409
          ? SAVE_FIRST
          : failure instanceof ApiError && failure.status === 413
            ? "La foto debe pesar máximo 2 MB"
            : failure instanceof ApiError && failure.status === 400
              ? "No pudimos leer esa imagen"
              : accountError(failure, "No pudimos subir la foto."),
      );
    }
  }

  async function acceptConsent() {
    setConsentError(null);
    try {
      const consent = await recordWalkerConsent(userId);
      setProfile((current) => (current === null ? current : { ...current, consent }));
    } catch (failure: unknown) {
      setConsentError(failure instanceof ApiError && failure.status === 409 ? SAVE_FIRST : accountError(failure, "No pudimos guardar tu consentimiento."));
    }
  }

  if (profile === null) {
    return (
      <div className="explore oglass oprofile wprofile">
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

  const isNew = profile.displayName === null;
  const { stats } = profile;
  const { average, count } = stats.rating;
  const ratingText = average === null ? "Sin calificaciones aún" : `★ ${average.toFixed(1)} (${count})`;
  const since = memberSince(profile.memberSince);
  const missing = missingItems(profile, draft);
  const percent = Math.round(((CHECK_COUNT - missing.length) / CHECK_COUNT) * 100);
  const badges: { on: boolean; text: string }[] = [
    { on: profile.consent !== null, text: profile.consent !== null ? "Política aceptada" : "Falta aceptar la política" },
    { on: profile.phone !== null, text: profile.phone !== null ? "Teléfono agregado" : "Sin teléfono" },
  ];
  if (average !== null && average >= TOP_RATED && count >= TOP_RATED_MIN) {
    badges.unshift({ on: true, text: "Muy bien calificado" });
  } else if (stats.walksDone < NEW_WALKER) {
    badges.unshift({ on: true, text: "Nuevo en CanTrack" });
  }

  return (
    <div className="explore oglass oprofile wprofile">
      <header className="wg__head">
        <div>
          <h1 className="wg__title">Perfil</h1>
          <p className="wg__sub">{profile.email} · {ratingText}</p>
        </div>
      </header>

      <section className="glass oprofile__hero" aria-label="Tu perfil">
        <div className="oprofile__photo">
          <Avatar src={profile.avatarUrl ?? undefined} alt="Tu foto de perfil" name={profile.displayName ?? undefined} size={96} />
          <label className="oprofile__photo-btn" htmlFor="walker-avatar">Cambiar foto</label>
          <input id="walker-avatar" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickPhoto(e)} />
        </div>
        <div className="oprofile__who">
          <h2 className="wprofile__name">{profile.displayName ?? "Tu perfil de paseador"}</h2>
          {since !== null ? <p className="oprofile__since">{since}{profile.serviceArea ? ` · ${profile.serviceArea}` : ""}</p> : null}
          <ul className="oprofile__badges" aria-label="Insignias">
            {badges.map((badge) => (
              <li key={badge.text} data-on={badge.on}>{badge.text}</li>
            ))}
          </ul>
        </div>
        <dl className="oprofile__stats wprofile__stats">
          <div><dt>Paseos</dt><dd>{stats.walksDone}</dd></div>
          <div><dt>Horas</dt><dd>{hoursLabel(stats.hoursWalked ?? 0)}</dd></div>
          <div><dt>Clientes</dt><dd>{stats.clients ?? 0}</dd></div>
          <div><dt>Calificación</dt><dd>{average === null ? "—" : `★ ${average.toFixed(1)}`}</dd></div>
        </dl>
        {photoError !== null ? <p className="explore__error" role="alert">{photoError}</p> : null}
      </section>

      {isNew ? <p className="explore__notice" role="status">Completa tu perfil para recibir solicitudes</p> : null}

      <section className="glass wprofile__progress" aria-label="Qué tan completo está tu perfil">
        <div className="wprofile__progress-top">
          <strong>{percent === 100 ? "Tu perfil está completo" : `Perfil completo al ${percent}%`}</strong>
          <span>{CHECK_COUNT - missing.length} de {CHECK_COUNT}</span>
        </div>
        <div className="wprofile__meter" role="progressbar" aria-label="Perfil completo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span style={{ width: `${percent}%` }} />
        </div>
        {missing.length > 0 ? (
          <p className="explore__hint">
            Te falta: {missing.join(", ")}. Los dueños eligen más a quien muestra foto, experiencia y unas líneas sobre sí.
          </p>
        ) : null}
      </section>

      <OwnerPreview profile={profile} draft={draft} />

      <Section title="Tu perfil de paseador" summary={profile.pricePerWalk === null ? "Sin precio" : `${formatCop(profile.pricePerWalk)} por paseo`} defaultOpen={isNew}>
        <form onSubmit={(event) => void save(event)} noValidate aria-label="Tu perfil de paseador">
          <div className="oprofile__row">
            <div className="explore__field">
              <label className="explore__label" htmlFor="walker-name">Nombre</label>
              <input id="walker-name" className="explore__input" value={draft.name} autoComplete="name" onChange={(e) => edit("name", e.target.value)} />
            </div>
            <div className="explore__field">
              <label className="explore__label" htmlFor="walker-price">Precio por paseo (COP)</label>
              <input id="walker-price" className="explore__input" inputMode="numeric" value={draft.price} placeholder="18000" onChange={(e) => edit("price", e.target.value)} />
              <span className="explore__hint">Es tu precio de referencia; en cada oferta puedes ajustarlo.</span>
            </div>
          </div>
          <div className="explore__field">
            <label className="explore__label" htmlFor="walker-bio">Sobre ti</label>
            <textarea
              id="walker-bio"
              className="explore__input oprofile__textarea"
              rows={4}
              maxLength={500}
              value={draft.bio}
              placeholder="Cuéntale al dueño cómo paseas: rutas, ritmo, si mandas fotos, con qué perros te va mejor."
              onChange={(e) => edit("bio", e.target.value)}
            />
            <span className="explore__hint">{draft.bio.length}/500</span>
          </div>
          <div className="oprofile__row">
            <div className="explore__field">
              <label className="explore__label" htmlFor="walker-area">Zona de servicio</label>
              <input id="walker-area" className="explore__input" value={draft.area} placeholder="Centro, Las Cuadras, Palermo" onChange={(e) => edit("area", e.target.value)} />
            </div>
            <div className="explore__field">
              <label className="explore__label" htmlFor="walker-years">Años de experiencia</label>
              <input id="walker-years" className="explore__input" inputMode="numeric" value={draft.years} placeholder="0" onChange={(e) => edit("years", e.target.value)} />
            </div>
          </div>
          <div className="explore__field">
            <span className="explore__label" id="walker-sizes-label">Tamaños que paseas</span>
            <div className="explore__segments" role="group" aria-labelledby="walker-sizes-label">
              {DOG_SIZES.map((size) => (
                <button key={size.id} type="button" className="explore__segment" aria-pressed={draft.sizes.includes(size.id)} onClick={() => toggleSize(size.id)}>
                  {size.label}
                </button>
              ))}
            </div>
          </div>
          <div className="explore__field">
            <label className="explore__label" htmlFor="walker-phone">Teléfono</label>
            <input id="walker-phone" className="explore__input" type="tel" value={draft.phone} autoComplete="tel" placeholder="+57 300 123 4567" onChange={(e) => edit("phone", e.target.value)} />
            <span className="explore__hint">No se muestra a los dueños; es para tu cuenta.</span>
          </div>
          {isNew ? (
            <label className="auth-consent" htmlFor="walker-consent">
              <input id="walker-consent" className="auth-consent__box" type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span>Acepto la política de tratamiento de datos</span>
            </label>
          ) : null}
          {errors.map((text) => (
            <p className="explore__error" role="alert" key={text}>{text}</p>
          ))}
          {message !== null ? <p className="explore__notice" role="status">{message}</p> : null}
          <button type="submit" className="explore__cta" disabled={isSaving}>{isSaving ? "Guardando…" : "Guardar"}</button>
        </form>
      </Section>

      <Section title="Calificaciones" summary={average === null ? "Aún no tienes" : `★ ${average.toFixed(1)} · ${count === 1 ? "1 calificación" : `${count} calificaciones`}`}>
        <Reviews profile={profile} />
      </Section>

      <Section title="Historial" summary={stats.walksDone === 1 ? "1 paseo hecho" : `${stats.walksDone} paseos hechos`}>
        <section aria-label="Historial">
          <div className="explore__segments" role="group" aria-label="Estado de los paseos">
            {TABS.map((option) => (
              <button key={option.id} type="button" className="explore__segment" aria-pressed={tab === option.id} onClick={() => setTab(option.id)}>
                {option.label}
              </button>
            ))}
          </div>
          {history.length === 0 ? <p className="explore__empty">No hay paseos en esta pestaña.</p> : null}
          <ul className="explore__list">
            {history.map((walk) => (
              <li key={walk.id} className="explore__offer">
                <div className="explore__offer-main">
                  <strong>{walk.dogName ?? "Un perro"} · {walk.ownerName ?? "Dueño"}</strong>
                  <span>
                    {formatWhenBogota(walk.requestedTime)} · {formatCop(walk.priceCop)}
                    {typeof walk.rating === "number" ? ` · ★ ${walk.rating}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </Section>

      <Section title="Privacidad y cuenta" summary={profile.consent !== null ? "Política aceptada" : "Falta aceptar la política"}>
        {!isNew ? (
          profile.consent !== null ? (
            <p className="explore__hint">
              Aceptaste la política de datos ({profile.consent.version}) el {shortDate(profile.consent.at)}
            </p>
          ) : (
            <>
              <p className="explore__hint">Aún no has aceptado el tratamiento de datos personales.</p>
              <button type="button" className="explore__small explore__small--lime" onClick={() => void acceptConsent()}>
                Acepto el tratamiento de datos
              </button>
            </>
          )
        ) : (
          <p className="explore__hint">Guarda tu perfil para aceptar la política de datos.</p>
        )}
        {consentError !== null ? <p className="explore__error" role="alert">{consentError}</p> : null}
        <div className="oprofile__account">
          <AccountSettings role="walker" userId={userId} onSignOut={onSignOut} />
        </div>
      </Section>
    </div>
  );
}
