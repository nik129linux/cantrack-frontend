import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createDog, enrollEmbedding, fetchDogs } from "../lib/api.js";
import { getEmbedding } from "../lib/clip.js";

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

    void fetchDogs()
      .then((loadedDogs) => {
        if (isMounted) {
          setDogs(loadedDogs);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setDogsError(getErrorMessage(error, "Unable to load dogs."));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingDogs(false);
        }
      });

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
    <main ref={screenRef} data-cantrack-owner-dogs-screen>
      <h1>My dogs</h1>

      <section aria-labelledby="dog-list-heading">
        <h2 id="dog-list-heading">Dogs</h2>
        {isLoadingDogs ? <p>Loading dogs...</p> : null}
        {dogsError !== null ? <p role="alert">{dogsError}</p> : null}
        {!isLoadingDogs && dogs.length === 0 ? <p>No dogs yet.</p> : null}
        {dogs.length > 0 ? (
          <ul>
            {dogs.map((dog) => (
              <li key={dog.id}>
                <div>
                  <strong>{dog.name}</strong>
                  {dog.breed !== null && dog.breed !== undefined ? (
                    <span> {dog.breed}</span>
                  ) : null}
                </div>
                <button
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

      <section aria-labelledby="add-dog-heading">
        <h2 id="add-dog-heading">Add a dog</h2>
        <form onSubmit={handleCreateDog} noValidate>
          <div>
            <label htmlFor="dog-name">Name</label>
            <input
              id="dog-name"
              name="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="dog-breed">Breed</label>
            <input
              id="dog-breed"
              name="breed"
              type="text"
              value={breed}
              onChange={(event) => setBreed(event.target.value)}
            />
          </div>
          <button type="submit" disabled={isCreating}>
            Add dog
          </button>
        </form>
        {createError !== null ? <p role="alert">{createError}</p> : null}
      </section>

      {selectedDog !== undefined ? (
        <section aria-labelledby="enrollment-heading">
          <h2 id="enrollment-heading">Enroll photos for {selectedDog.name}</h2>
          <form onSubmit={handleEnrollment} noValidate>
            <div>
              <label htmlFor="reference-photos">Reference photos (exactly 3)</label>
              <input
                id="reference-photos"
                name="reference-photos"
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotosChange}
              />
            </div>
            <button type="submit" disabled={isEnrolling}>
              Save enrollment
            </button>
            <button type="button" onClick={() => setSelectedDogId(null)}>
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
