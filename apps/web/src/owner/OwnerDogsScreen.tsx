import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createDog, enrollPhotos, fetchDogs } from "../lib/api.js";
import { Banner } from "../ui/Banner.js";
import { Button } from "../ui/Button.js";
import { EmptyState } from "../ui/EmptyState.js";
import { ListRow } from "../ui/ListRow.js";
import { PetTile, petTintFor } from "../ui/PetTile.js";
import { Toast } from "../ui/Toast.js";
import { PawIcon } from "../ui/icons.js";

type Dog = {
  id: string;
  name: string;
  breed?: string | null;
  notes?: string | null;
};

type NewDog = {
  name: string;
  breed?: string;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
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
      if (
        child !== container &&
        child.querySelector("[data-cantrack-owner-dogs-screen]") !== null
      ) {
        child.remove();
      }
    }
  }, []);

  return screenRef;
}

export function OwnerDogsScreen() {
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [isLoadingDogs, setIsLoadingDogs] = useState(true);
  const [dogsError, setDogsError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [enrollmentSuccess, setEnrollmentSuccess] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const screenRef = useOwnerDogsScreenMount();

  useEffect(() => {
    let isMounted = true;

    async function loadDogs() {
      try {
        const loadedDogs = await fetchDogs();
        if (isMounted) {
          setDogs(loadedDogs);
        }
      } catch (error: unknown) {
        if (isMounted) {
          setDogsError(getErrorMessage(error, "Unable to load dogs."));
        }
      } finally {
        if (isMounted) {
          setIsLoadingDogs(false);
        }
      }
    }

    void loadDogs();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCreateDog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedBreed = breed.trim();

    if (trimmedName.length === 0) {
      setCreateError("This field is required.");
      return;
    }

    const input: NewDog = { name: trimmedName };
    if (trimmedBreed.length > 0) {
      input.breed = trimmedBreed;
    }

    setCreateError(null);
    setIsCreating(true);
    try {
      const createdDog = await createDog(input);
      if (createdDog !== undefined) {
        setDogs((currentDogs) => [...currentDogs, createdDog]);
      }
      setName("");
      setBreed("");
    } catch (error: unknown) {
      setCreateError(getErrorMessage(error, "Unable to create the dog."));
    } finally {
      setIsCreating(false);
    }
  }

  function openEnrollment(dogId: string) {
    setSelectedDogId(dogId);
    setPhotos([]);
    setEnrollmentError(null);
    setEnrollmentSuccess(null);
  }

  function handlePhotosChange(event: ChangeEvent<HTMLInputElement>) {
    setPhotos(event.currentTarget.files === null ? [] : Array.from(event.currentTarget.files));
    setEnrollmentError(null);
    setEnrollmentSuccess(null);
  }

  async function handleEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (photos.length !== 3) {
      setEnrollmentError("Exactly 3 photos are required.");
      return;
    }

    if (selectedDogId === null) {
      setEnrollmentError("Select a dog before enrolling photos.");
      return;
    }

    setEnrollmentError(null);
    setEnrollmentSuccess(null);
    setIsEnrolling(true);
    try {
      await enrollPhotos(selectedDogId, photos);
      setPhotos([]);
      setEnrollmentSuccess("Photo enrollment saved.");
    } catch (error: unknown) {
      setEnrollmentError(getErrorMessage(error, "Unable to save photo enrollment."));
    } finally {
      setIsEnrolling(false);
    }
  }

  const selectedDog = dogs.find((dog) => dog.id === selectedDogId);

  return (
    <main ref={screenRef} className="owner-screen" data-cantrack-owner-dogs-screen>
      <Banner title="My dogs" subtitle="Your pack, reference photos and walks." tint="sage" />

      <section className="owner-screen__section--list" aria-labelledby="dog-list-heading">
        <h2 className="section-title" id="dog-list-heading">Dogs</h2>
        {isLoadingDogs ? <p className="app-shell__status">Loading dogs...</p> : null}
        {dogsError !== null ? <p className="app-shell__alert" role="alert">{dogsError}</p> : null}
        {!isLoadingDogs && dogs.length === 0 ? (
          <EmptyState
            title="No dogs yet."
            message="Add your first dog below, then enroll its 3 reference photos."
          />
        ) : null}
        {dogs.length > 0 ? (
          <ul className="dog-list">
            {dogs.map((dog) => (
              <li className="dog-list__item" key={dog.id}>
                <ListRow
                  data-tint={petTintFor(dog.id)}
                  icon={<PawIcon />}
                  title={dog.name}
                  subtitle={dog.breed ?? undefined}
                  trailing={
                    <Button variant="secondary" onClick={() => openEnrollment(dog.id)}>
                      Enroll photos
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="owner-screen__section--form" aria-labelledby="add-dog-heading">
        <h2 className="section-title" id="add-dog-heading">Add a dog</h2>
        <form onSubmit={handleCreateDog} noValidate>
          <div className="form-field">
            <label className="form-label" htmlFor="dog-name">Name</label>
            <input
              id="dog-name"
              className="form-input"
              name="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="dog-breed">Breed</label>
            <input
              id="dog-breed"
              className="form-input"
              name="breed"
              type="text"
              value={breed}
              onChange={(event) => setBreed(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={isCreating}>
            Add dog
          </Button>
        </form>
        {createError !== null ? <p className="app-shell__alert" role="alert">{createError}</p> : null}
      </section>

      {selectedDog !== undefined ? (
        <section className="owner-screen__section--enrollment" aria-labelledby="enrollment-heading">
          <h2 className="section-title" id="enrollment-heading">
            Enroll photos for {selectedDog.name}
          </h2>
          <div className="owner-screen__enrollment-tile">
            <PetTile dogId={selectedDog.id} name={selectedDog.name} />
          </div>
          <form onSubmit={handleEnrollment} noValidate>
            <div className="form-field">
              <label className="form-label" htmlFor="reference-photos">Reference photos (exactly 3)</label>
              <input
                id="reference-photos"
                className="form-file"
                name="reference-photos"
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotosChange}
              />
            </div>
            <div className="owner-screen__enrollment-actions">
              <Button type="submit" disabled={isEnrolling}>
                Save enrollment
              </Button>
              <Button variant="secondary" onClick={() => setSelectedDogId(null)}>
                Cancel enrollment
              </Button>
            </div>
          </form>
          {enrollmentError !== null ? <Toast tone="error" message={enrollmentError} /> : null}
          {enrollmentSuccess !== null ? <Toast tone="success" message={enrollmentSuccess} /> : null}
        </section>
      ) : null}
    </main>
  );
}
