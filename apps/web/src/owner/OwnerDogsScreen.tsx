import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createDog, enrollEmbedding, fetchDogs } from "../lib/api.js";

type Dog = {
  id: string;
  name: string;
  breed?: string | null;
  notes?: string | null;
  embedding?: number[] | null;
};

type NewDog = {
  name: string;
  breed?: string;
};

const dogToneNames = ["mint", "coral", "yellow", "sky", "green"] as const;

function getDogToneClass(index: number): string {
  return `dog-list__item--${dogToneNames[index % dogToneNames.length] ?? "mint"}`;
}

function DogPawIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <ellipse cx="19" cy="23" rx="7" ry="9" fill="currentColor" />
      <ellipse cx="32" cy="17" rx="7" ry="9" fill="currentColor" />
      <ellipse cx="45" cy="23" rx="7" ry="9" fill="currentColor" />
      <path
        d="M32 28c-9 0-17 8-17 16 0 6 5 10 11 10 3 0 4-2 6-2s3 2 6 2c6 0 11-4 11-10 0-8-8-16-17-16Z"
        fill="currentColor"
      />
    </svg>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

function averageEmbeddings(embeddings: number[][]): number[] {
  const length = embeddings[0]?.length ?? 0;
  if (length === 0 || embeddings.some((embedding) => embedding.length !== length)) {
    throw new Error("The image model returned incompatible embeddings.");
  }

  return Array.from({ length }, (_, index) =>
    embeddings.reduce((total, embedding) => total + embedding[index], 0) / embeddings.length,
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
      const { getEmbedding } = await import("../lib/clip.js");
      const embeddings = await Promise.all(photos.map((photo) => getEmbedding(photo)));
      const embedding = averageEmbeddings(embeddings);
      await enrollEmbedding(selectedDogId, embedding);
      setDogs((currentDogs) =>
        currentDogs.map((dog) =>
          dog.id === selectedDogId ? { ...dog, embedding } : dog,
        ),
      );
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
      <h1>My dogs</h1>

      <section className="owner-screen__section--list" aria-labelledby="dog-list-heading">
        <h2 id="dog-list-heading">Dogs</h2>
        {isLoadingDogs ? <p>Loading dogs...</p> : null}
        {dogsError !== null ? <p role="alert">{dogsError}</p> : null}
        {!isLoadingDogs && dogs.length === 0 ? (
          <div className="owner-empty">
            <span className="owner-empty__illustration" aria-hidden="true">
              <DogPawIcon />
            </span>
            <p>No dogs yet.</p>
          </div>
        ) : null}
        {dogs.length > 0 ? (
          <ul className="dog-list">
            {dogs.map((dog, dogIndex) => (
              <li className={`dog-list__item ${getDogToneClass(dogIndex)}`} key={dog.id}>
                <div className="dog-list__identity">
                  <span className="dog-list__icon" aria-hidden="true">
                    <DogPawIcon />
                  </span>
                  <div className="dog-list__copy">
                    <strong>{dog.name}</strong>
                    {dog.breed !== null && dog.breed !== undefined ? (
                      <span className="dog-list__meta">{dog.breed}</span>
                    ) : null}
                  </div>
                </div>
                <button
                  className="form-button form-button--secondary"
                  type="button"
                  onClick={() => openEnrollment(dog.id)}
                >
                  Enroll photos
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="owner-screen__section--form" aria-labelledby="add-dog-heading">
        <h2 id="add-dog-heading">Add a dog</h2>
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
          <button
            className="form-button form-button--primary form-button--block"
            type="submit"
            disabled={isCreating}
          >
            Add dog
          </button>
        </form>
        {createError !== null ? <p role="alert">{createError}</p> : null}
      </section>

      {selectedDog !== undefined ? (
        <section className="owner-screen__section--enrollment" aria-labelledby="enrollment-heading">
          <h2 id="enrollment-heading">Enroll photos for {selectedDog.name}</h2>
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
            <button
              className="form-button form-button--primary form-button--block"
              type="submit"
              disabled={isEnrolling}
            >
              Save enrollment
            </button>
            <button
              className="form-button form-button--secondary form-button--block"
              type="button"
              onClick={() => setSelectedDogId(null)}
            >
              Cancel enrollment
            </button>
          </form>
          {enrollmentError !== null ? <p role="alert">{enrollmentError}</p> : null}
          {enrollmentSuccess !== null ? <p role="status">{enrollmentSuccess}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
