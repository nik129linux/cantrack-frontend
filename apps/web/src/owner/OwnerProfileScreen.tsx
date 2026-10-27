import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { AccountSettings, accountError } from "../account/AccountSettings.js";
import { ApiError } from "../lib/apiError.js";
import { resizeImage } from "../lib/image.js";
import { saveHomePoint } from "../lib/homePoint.js";
import {
  fetchOwnerProfile,
  recordOwnerConsent,
  saveOwnerProfile,
  uploadOwnerAvatar,
  type OwnerProfile,
} from "../lib/marketplace.js";
import { PickupMap } from "../map/PickupMap.js";
import { parsePin } from "../map/pasto.js";
import { Avatar } from "../ui/Avatar.js";
import { DogLoader } from "../ui/DogLoader.js";
import "./explore.css";

const PHONE = /^\+?[\d ]{7,20}$/;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function consentDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export type OwnerProfileScreenProps = {
  userId: string;
  onSignOut: (scope?: "global") => void;
};

/** Perfil (owner): profile, photo, home point, consent and the shared account settings. */
export function OwnerProfileScreen({ userId, onSignOut }: OwnerProfileScreenProps) {
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [homeLabel, setHomeLabel] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  function apply(next: OwnerProfile) {
    setProfile(next);
    setName(next.displayName ?? "");
    setPhone(next.phone ?? "");
    setHomeLabel(next.home?.label ?? "");
    setLat(next.home ? String(next.home.lat) : "");
    setLng(next.home ? String(next.home.lng) : "");
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
  }, [userId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const found: string[] = [];
    if (name.trim().length < 1 || name.trim().length > 80) {
      found.push("Escribe tu nombre (máx. 80)");
    }
    if (phone.trim() !== "" && !PHONE.test(phone.trim())) {
      found.push("Teléfono no válido");
    }
    const pin = parsePin(lat, lng);
    if (homeLabel.trim().length > 120 || (homeLabel.trim() !== "" && pin === null)) {
      found.push("Ubicación no válida");
    }
    setErrors(found);
    if (found.length > 0) {
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveOwnerProfile(userId, {
        displayName: name.trim(),
        phone: phone.trim() === "" ? null : phone.trim(),
        home: pin !== null ? { lat: pin.lat, lng: pin.lng, label: homeLabel.trim() || "Casa" } : null,
      });
      apply(saved);
      setMessage("Guardamos tu perfil.");
    } catch (failure: unknown) {
      setErrors([accountError(failure, "No pudimos guardar tu perfil.")]);
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
      setErrors([accountError(failure, "No pudimos guardar tu consentimiento.")]);
    }
  }

  if (profile === null) {
    return (
      <div className="explore">
        {loadError !== null ? <p className="explore__error" role="alert">{loadError}</p> : <DogLoader label="Cargando tu perfil…" />}
      </div>
    );
  }

  return (
    <div className="explore">
      <header className="explore__head">
        <h1 className="explore__title">Perfil</h1>
        <p className="explore__subtitle">{profile.email}</p>
      </header>

      {profile.displayName === null ? (
        <p className="explore__notice" role="status">Completa tu perfil: dinos cómo te llamas.</p>
      ) : null}

      <section className="explore__form" aria-label="Tu foto">
        <Avatar src={profile.avatarUrl ?? undefined} alt="Tu foto de perfil" size={88} />
        <label className="explore__small explore__small--lime" htmlFor="owner-avatar">
          Cambiar foto
        </label>
        <input id="owner-avatar" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickPhoto(e)} />
        {photoError !== null ? <p className="explore__error" role="alert">{photoError}</p> : null}
        <p className="explore__hint">{profile.stats.dogs} perros · {profile.stats.walksDone} paseos hechos</p>
      </section>

      <form className="explore__form" onSubmit={(event) => void save(event)} noValidate aria-label="Tus datos de perfil">
        <h2 className="explore__section">Tus datos</h2>
        <div className="explore__field">
          <label className="explore__label" htmlFor="owner-name">Nombre</label>
          <input id="owner-name" className="explore__input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="explore__field">
          <label className="explore__label" htmlFor="owner-phone">Teléfono</label>
          <input id="owner-phone" className="explore__input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </div>
        <div className="explore__field">
          <label className="explore__label" htmlFor="owner-home">Dónde recogen a tu perro (por defecto)</label>
          <input id="owner-home" className="explore__input" value={homeLabel} placeholder="Casa, Las Cuadras" onChange={(e) => setHomeLabel(e.target.value)} />
        </div>
        <PickupMap lat={lat} lng={lng} onPick={(a, b) => { setLat(String(a)); setLng(String(b)); }} />
        {errors.map((text) => (
          <p className="explore__error" role="alert" key={text}>{text}</p>
        ))}
        {message !== null ? <p className="explore__notice" role="status">{message}</p> : null}
        <button type="submit" className="explore__cta" disabled={isSaving}>
          {isSaving ? "Guardando…" : "Guardar"}
        </button>
      </form>

      <section className="explore__form" aria-label="Política de datos">
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
      </section>

      <AccountSettings role="owner" userId={userId} onSignOut={onSignOut} />
    </div>
  );
}
