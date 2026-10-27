import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
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
  type WalkTab,
  type WalkerAccountProfile,
  type WalkerHistoryItem,
} from "../lib/marketplace.js";
import { Avatar } from "../ui/Avatar.js";
import { DogLoader } from "../ui/DogLoader.js";
import { Pill } from "../ui/Pill.js";
import "../owner/explore.css";

const PHONE = /^\+?[\d ]{7,20}$/;
const SAVE_FIRST = "Guarda tu perfil primero";

const TABS: { id: WalkTab; label: string }[] = [
  { id: "upcoming", label: "Programados" },
  { id: "active", label: "En curso" },
  { id: "past", label: "Pasados" },
];

export type WalkerProfileScreenProps = {
  userId: string;
  onSignOut: (scope?: "global") => void;
};

/** Perfil (walker): validated profile, photo, consent, history and the shared account settings. */
export function WalkerProfileScreen({ userId, onSignOut }: WalkerProfileScreenProps) {
  const [profile, setProfile] = useState<WalkerAccountProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [area, setArea] = useState("");
  const [price, setPrice] = useState("");
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [tab, setTab] = useState<WalkTab>("past");
  const [history, setHistory] = useState<WalkerHistoryItem[]>([]);

  function apply(next: WalkerAccountProfile) {
    setProfile(next);
    setName(next.displayName ?? "");
    setBio(next.bio ?? "");
    setArea(next.serviceArea ?? "");
    setPrice(next.pricePerWalk === null ? "" : String(next.pricePerWalk));
    setPhone(next.phone ?? "");
  }

  useEffect(() => {
    let isMounted = true;
    fetchWalkerAccountProfile(userId)
      .then((loaded) => isMounted && apply(loaded))
      .catch((failure: unknown) => isMounted && setLoadError(accountError(failure, "No pudimos cargar tu perfil.")));
    return () => {
      isMounted = false;
    };
  }, [userId]);

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
    const amount = Number(price);
    if (name.trim().length < 1 || name.trim().length > 80) {
      found.push("Escribe tu nombre (máx. 80)");
    }
    if (price.trim() === "" || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
      found.push("El precio por paseo debe estar entre $0 y $1.000.000");
    }
    if (bio.length > 500) {
      found.push("La descripción admite máximo 500 caracteres");
    }
    if (area.length > 120) {
      found.push("La zona admite máximo 120 caracteres");
    }
    if (phone.trim() !== "" && !PHONE.test(phone.trim())) {
      found.push("Teléfono no válido");
    }
    setErrors(found);
    if (found.length > 0) {
      return;
    }

    const isFirstSave = profile?.displayName === null;
    setIsSaving(true);
    try {
      let saved = await saveWalkerAccountProfile(userId, {
        displayName: name.trim(),
        bio: bio.trim() === "" ? null : bio.trim(),
        serviceArea: area.trim() === "" ? null : area.trim(),
        pricePerWalk: Math.round(amount),
        phone: phone.trim() === "" ? null : phone.trim(),
      });
      // The consent needs a saved profile (409 before it): send it right after the first save.
      if (isFirstSave && accepted) {
        try {
          const consent = await recordWalkerConsent(userId);
          saved = { ...saved, consent };
        } catch {
          // Perfil shows the consent button again.
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
    try {
      const consent = await recordWalkerConsent(userId);
      setProfile((current) => (current === null ? current : { ...current, consent }));
    } catch (failure: unknown) {
      setErrors([failure instanceof ApiError && failure.status === 409 ? SAVE_FIRST : accountError(failure, "No pudimos guardar tu consentimiento.")]);
    }
  }

  if (profile === null) {
    return (
      <div className="explore">
        {loadError !== null ? <p className="explore__error" role="alert">{loadError}</p> : <DogLoader label="Cargando tu perfil…" />}
      </div>
    );
  }

  const isNew = profile.displayName === null;

  return (
    <div className="explore">
      <header className="explore__head">
        <h1 className="explore__title">Perfil</h1>
        <p className="explore__subtitle">
          {profile.email} ·{" "}
          {profile.stats.rating.average === null
            ? "Sin calificaciones aún"
            : `★ ${profile.stats.rating.average.toFixed(1)} (${profile.stats.rating.count})`}
        </p>
      </header>

      {isNew ? <p className="explore__notice" role="status">Completa tu perfil para recibir solicitudes</p> : null}

      <section className="explore__form" aria-label="Tu foto">
        <Avatar src={profile.avatarUrl ?? undefined} alt="Tu foto de perfil" size={88} />
        <label className="explore__small explore__small--lime" htmlFor="walker-avatar">Cambiar foto</label>
        <input id="walker-avatar" className="sr-only" type="file" accept="image/*" onChange={(e) => void pickPhoto(e)} />
        {photoError !== null ? <p className="explore__error" role="alert">{photoError}</p> : null}
      </section>

      <form className="explore__form" onSubmit={(event) => void save(event)} noValidate aria-label="Tu perfil de paseador">
        <h2 className="explore__section">Tu perfil de paseador</h2>
        <div className="explore__field">
          <label className="explore__label" htmlFor="walker-name">Nombre</label>
          <input id="walker-name" className="explore__input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="explore__field">
          <label className="explore__label" htmlFor="walker-price">Precio por paseo (COP)</label>
          <input id="walker-price" className="explore__input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="explore__field">
          <label className="explore__label" htmlFor="walker-area">Zona de servicio</label>
          <input id="walker-area" className="explore__input" value={area} onChange={(e) => setArea(e.target.value)} />
        </div>
        <div className="explore__field">
          <label className="explore__label" htmlFor="walker-bio">Sobre ti</label>
          <textarea id="walker-bio" className="explore__input" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <div className="explore__field">
          <label className="explore__label" htmlFor="walker-phone">Teléfono</label>
          <input id="walker-phone" className="explore__input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
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

      {!isNew ? (
        <section className="explore__form" aria-label="Política de datos">
          {profile.consent !== null ? (
            <p className="explore__hint">Aceptaste la política de datos ({profile.consent.version})</p>
          ) : (
            <button type="button" className="explore__small explore__small--lime" onClick={() => void acceptConsent()}>
              Acepto el tratamiento de datos
            </button>
          )}
        </section>
      ) : null}

      <section className="explore__offers" aria-label="Historial">
        <h2 className="explore__section">Historial</h2>
        <div className="explore__segments" role="group" aria-label="Estado de los paseos">
          {TABS.map((option) => (
            <Pill key={option.id} active={tab === option.id} onClick={() => setTab(option.id)}>
              {option.label}
            </Pill>
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

      <AccountSettings role="walker" userId={userId} onSignOut={onSignOut} />
    </div>
  );
}
