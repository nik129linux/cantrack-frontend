import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  cancelRequest,
  createRequest,
  fetchDogs,
  fetchRequests,
  fetchWalkerProfiles,
  type Dog,
  type OwnerRequestView,
  type WalkerProfile,
} from "../lib/api.js";
import { Badge } from "../ui/Badge.js";
import { Banner } from "../ui/Banner.js";
import { Button } from "../ui/Button.js";
import { EmptyState } from "../ui/EmptyState.js";
import { ListRow } from "../ui/ListRow.js";
import { Toast } from "../ui/Toast.js";
import { PersonIcon } from "../ui/icons.js";

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
 * The owner's Discover tab (S1): browse walker profiles, pick one and send a
 * walk request (dog + when + pickup pin as coordinates — the Leaflet map is
 * S5), then track and cancel their own requests. The price is the walker's
 * (the server copies it from their profile; the form never sends one).
 */
export function OwnerDiscoverScreen() {
  const [walkers, setWalkers] = useState<WalkerProfile[]>([]);
  const [isLoadingWalkers, setIsLoadingWalkers] = useState(true);
  const [walkersError, setWalkersError] = useState<string | null>(null);
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [requests, setRequests] = useState<OwnerRequestView[]>([]);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [selectedWalker, setSelectedWalker] = useState<WalkerProfile | null>(null);
  const [dogId, setDogId] = useState("");
  const [when, setWhen] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelStatus, setCancelStatus] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      const data = await fetchRequests<OwnerRequestView>();
      setRequests(data);
      setRequestsError(null);
    } catch (error: unknown) {
      setRequestsError(getErrorMessage(error, "Unable to load your requests."));
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadWalkers() {
      try {
        const data = await fetchWalkerProfiles();
        if (isMounted) {
          setWalkers(data);
          setWalkersError(null);
        }
      } catch (error: unknown) {
        if (isMounted) {
          setWalkersError(getErrorMessage(error, "Unable to load the walkers."));
        }
      } finally {
        if (isMounted) {
          setIsLoadingWalkers(false);
        }
      }
    }

    async function loadDogs() {
      try {
        const data = await fetchDogs();
        if (isMounted) {
          setDogs(data);
        }
      } catch {
        // The dog picker stays empty; the request form validates on submit.
      }
    }

    void loadWalkers();
    void loadDogs();
    void loadRequests();

    return () => {
      isMounted = false;
    };
  }, [loadRequests]);

  function validateForm(): string[] {
    const errors: string[] = [];
    if (dogId === "") {
      errors.push("Choose a dog.");
    }
    if (when.trim() === "") {
      errors.push("Choose a date and time.");
    }
    const latValue = Number(lat);
    if (lat.trim() === "" || Number.isNaN(latValue) || latValue < -90 || latValue > 90) {
      errors.push("Pickup latitude must be between -90 and 90.");
    }
    const lngValue = Number(lng);
    if (lng.trim() === "" || Number.isNaN(lngValue) || lngValue < -180 || lngValue > 180) {
      errors.push("Pickup longitude must be between -180 and 180.");
    }
    return errors;
  }

  async function handleSendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormErrors([]);
    setCreateError(null);
    setCreateStatus(null);

    if (selectedWalker === null || isSending) {
      return;
    }

    const errors = validateForm();
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSending(true);
    try {
      await createRequest({
        walkerId: selectedWalker.walkerId,
        dogId,
        requestedTime: when,
        pickupLat: Number(lat),
        pickupLng: Number(lng),
      });
      setCreateStatus("Request sent.");
      await loadRequests();
    } catch (error: unknown) {
      setCreateError(getErrorMessage(error, "Unable to send the request."));
    } finally {
      setIsSending(false);
    }
  }

  async function handleCancel(requestId: string) {
    if (cancellingId !== null) {
      return;
    }

    setCancellingId(requestId);
    setCancelError(null);
    setCancelStatus(null);
    try {
      await cancelRequest(requestId);
      setCancelStatus("Request cancelled.");
      await loadRequests();
    } catch (error: unknown) {
      setCancelError(getErrorMessage(error, "Unable to cancel the request."));
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="discover-screen">
      <Banner title="Find a walker" subtitle="Browse profiles and request a walk." tint="mint" />

      {walkersError !== null ? <Toast tone="error" message={walkersError} /> : null}
      {isLoadingWalkers ? <p className="app-shell__status">Loading walkers...</p> : null}
      {!isLoadingWalkers && walkersError === null && walkers.length === 0 ? (
        <EmptyState
          title="No walkers yet"
          message="Walkers near you will appear here once they publish a profile."
        />
      ) : null}
      {walkers.length > 0 ? (
        <ul className="discover-screen__walkers">
          {walkers.map((walker) => (
            <li key={walker.walkerId}>
              <ListRow
                icon={<PersonIcon />}
                title={walker.displayName}
                subtitle={`${walker.serviceArea ?? "Anywhere"} · ${walker.pricePerWalk} COP`}
                trailing={
                  selectedWalker?.walkerId === walker.walkerId ? (
                    <Badge status="accepted" label="Selected" />
                  ) : undefined
                }
                onClick={() => setSelectedWalker(walker)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {selectedWalker !== null ? (
        <section className="discover-screen__form" aria-labelledby="request-form-heading">
          <h2 className="section-title" id="request-form-heading">
            Request a walk
          </h2>
          <form onSubmit={handleSendRequest} noValidate>
            <div className="form-field">
              <label className="form-label" htmlFor="request-dog">Dog</label>
              <select
                id="request-dog"
                className="form-input"
                value={dogId}
                onChange={(event) => setDogId(event.target.value)}
              >
                <option value="" />
                {dogs.map((dog) => (
                  <option key={dog.id} value={dog.id}>
                    {dog.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="request-when">When</label>
              <input
                id="request-when"
                className="form-input"
                type="datetime-local"
                value={when}
                onChange={(event) => setWhen(event.target.value)}
              />
            </div>
            <div className="discover-screen__pin">
              <div className="form-field">
                <label className="form-label" htmlFor="request-lat">Pickup latitude</label>
                <input
                  id="request-lat"
                  className="form-input"
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(event) => setLat(event.target.value)}
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="request-lng">Pickup longitude</label>
                <input
                  id="request-lng"
                  className="form-input"
                  type="number"
                  step="any"
                  value={lng}
                  onChange={(event) => setLng(event.target.value)}
                />
              </div>
            </div>
            {formErrors.map((message) => (
              <p className="form-error" key={message}>
                {message}
              </p>
            ))}
            <Button type="submit" disabled={isSending}>
              Send request
            </Button>
          </form>
        </section>
      ) : null}

      {createStatus !== null ? <Toast tone="success" message={createStatus} /> : null}
      {createError !== null ? <Toast tone="error" message={createError} /> : null}

      <section className="discover-screen__requests" aria-labelledby="my-requests-heading">
        <h2 className="section-title" id="my-requests-heading">My requests</h2>
        {requestsError !== null ? <Toast tone="error" message={requestsError} /> : null}
        {cancelStatus !== null ? <Toast tone="success" message={cancelStatus} /> : null}
        {cancelError !== null ? <Toast tone="error" message={cancelError} /> : null}
        {requests.length === 0 ? (
          <p className="discover-screen__none">No requests sent yet.</p>
        ) : (
          <ul className="discover-screen__list">
            {requests.map((request) => (
              <li key={request.id}>
                <ListRow
                  title={request.dogName ?? "Your dog"}
                  subtitle={`${request.walkerName ?? "Walker"} · ${request.requestedTime}`}
                  trailing={
                    <>
                      <Badge status={request.status} />
                      {request.status === "pending" || request.status === "accepted" ? (
                        <Button
                          variant="secondary"
                          disabled={cancellingId !== null}
                          onClick={() => void handleCancel(request.id)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
