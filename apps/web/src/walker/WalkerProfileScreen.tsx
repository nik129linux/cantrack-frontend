import { useEffect, useState, type FormEvent } from "react";
import {
  fetchWalkerProfiles,
  saveWalkerProfile,
  type WalkerProfile,
} from "../lib/api.js";
import { Banner } from "../ui/Banner.js";
import { Button } from "../ui/Button.js";
import { Toast } from "../ui/Toast.js";

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

/**
 * The walker's public profile (S1): what owners see on the discovery card.
 * The catalog is loaded to prefill the caller's own entry (matched by
 * `userId`); saving goes through `saveWalkerProfile` with the exact DTO.
 * An empty display name is refused client-side and never reaches the API.
 */
export function WalkerProfileScreen({ userId }: { userId: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [pricePerWalk, setPricePerWalk] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadOwnProfile() {
      try {
        const profiles: WalkerProfile[] = await fetchWalkerProfiles();
        if (!isMounted) {
          return;
        }
        const own = profiles.find((profile) => profile.walkerId === userId);
        if (own !== undefined) {
          setDisplayName(own.displayName);
          setBio(own.bio ?? "");
          setServiceArea(own.serviceArea ?? "");
          setPricePerWalk(String(own.pricePerWalk));
        }
        setLoadError(null);
      } catch (error: unknown) {
        if (isMounted) {
          setLoadError(getErrorMessage(error, "Unable to load your profile."));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadOwnProfile();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSaveError(null);
    setSavedMessage(null);

    if (displayName.trim().length === 0) {
      setFormError("Display name is required.");
      return;
    }

    setIsSaving(true);
    try {
      await saveWalkerProfile({
        displayName: displayName.trim(),
        bio,
        serviceArea,
        pricePerWalk: Number(pricePerWalk),
      });
      setSavedMessage("Profile saved.");
    } catch (error: unknown) {
      setSaveError(getErrorMessage(error, "Unable to save your profile."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="profile-screen">
      <Banner title="Profile" subtitle="This is the card owners see." tint="butter" />

      {isLoading ? <p className="app-shell__status">Loading profile...</p> : null}
      {loadError !== null ? <Toast tone="error" message={loadError} /> : null}
      {savedMessage !== null ? <Toast tone="success" message={savedMessage} /> : null}
      {saveError !== null ? <Toast tone="error" message={saveError} /> : null}

      <form className="profile-screen__form" onSubmit={handleSave} noValidate>
        <div className="form-field">
          <label className="form-label" htmlFor="walker-display-name">Display name</label>
          <input
            id="walker-display-name"
            className="form-input"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="walker-bio">Bio</label>
          <textarea
            id="walker-bio"
            className="form-input profile-screen__bio"
            rows={3}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="walker-service-area">Service area</label>
          <input
            id="walker-service-area"
            className="form-input"
            type="text"
            value={serviceArea}
            onChange={(event) => setServiceArea(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="walker-price">Price per walk (COP)</label>
          <input
            id="walker-price"
            className="form-input"
            type="number"
            min={0}
            step={500}
            value={pricePerWalk}
            onChange={(event) => setPricePerWalk(event.target.value)}
          />
        </div>
        {formError !== null ? <p className="form-error">{formError}</p> : null}
        <Button type="submit" disabled={isSaving}>
          Save profile
        </Button>
      </form>
    </div>
  );
}
