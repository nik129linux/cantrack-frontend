import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  checkIn,
  fetchRoute,
  undoCheckIn,
  type CheckInResult,
  type Route,
} from "../lib/api.js";

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

function useWalkerRouteScreenMount() {
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
        child.querySelector("[data-cantrack-walker-route-screen]") !== null
      ) {
        child.remove();
      }
    }
  }, []);

  return screenRef;
}

export function WalkerRouteScreen({
  routeId,
  initialRoute,
}: {
  routeId: string;
  initialRoute?: Route;
}) {
  const [route, setRoute] = useState<Route | null>(initialRoute ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const screenRef = useWalkerRouteScreenMount();

  useEffect(() => {
    let isMounted = true;
    setRoute(initialRoute ?? null);
    setIsLoading(true);
    setRouteError(null);

    async function loadRoute() {
      try {
        const loadedRoute = await fetchRoute(routeId);
        if (isMounted) {
          setRoute(loadedRoute);
        }
      } catch (error: unknown) {
        if (isMounted) {
          setRouteError(getErrorMessage(error, "Unable to load the route."));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRoute();

    return () => {
      isMounted = false;
    };
  }, [initialRoute, routeId]);

  function openCheckIn(stopIndex: number) {
    setSelectedStopIndex(stopIndex);
    setCheckInResult(null);
    setSelectedCandidateId(null);
    setCheckInError(null);
  }

  async function handleCheckInPhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.currentTarget.files?.[0];
    if (photo === undefined) {
      return;
    }

    setIsCheckingIn(true);
    setCheckInError(null);
    setCheckInResult(null);
    setSelectedCandidateId(null);

    try {
      const { getEmbedding } = await import("../lib/clip.js");
      const embedding = await getEmbedding(photo);
      const result = await checkIn(routeId, embedding);
      setCheckInResult(result);
    } catch (error: unknown) {
      setCheckInError(getErrorMessage(error, "Unable to check in."));
    } finally {
      setIsCheckingIn(false);
    }
  }

  async function handleUndo() {
    setIsUndoing(true);
    setUndoError(null);
    setUndoMessage(null);

    try {
      const result = await undoCheckIn(routeId);
      setUndoMessage(result.message);
      setCheckInResult(null);
      setSelectedCandidateId(null);
    } catch (error: unknown) {
      setUndoError(getErrorMessage(error, "Unable to undo the check-in."));
    } finally {
      setIsUndoing(false);
    }
  }

  const confirmedStop =
    checkInResult?.autoConfirmed === true
      ? route?.stops.find((stop) => stop.dogId === checkInResult.dogId)
      : undefined;

  return (
    <main ref={screenRef} data-cantrack-walker-route-screen>
      <h1>Walker route</h1>
      <button type="button" onClick={() => void handleUndo()} disabled={isUndoing}>
        Undo
      </button>
      {undoMessage !== null ? <p role="status">{undoMessage}</p> : null}
      {undoError !== null ? <p role="alert">{undoError}</p> : null}

      {isLoading ? <p>Loading route...</p> : null}
      {routeError !== null ? <p role="alert">{routeError}</p> : null}

      {route !== null ? (
        <ol aria-label="Route stops">
          {route.stops.map((stop, stopIndex) => (
            <li data-testid="route-stop" key={`${stop.dogId}-${stopIndex}`}>
              <strong>{stop.dogName ?? stop.dogId}</strong>
              <time dateTime={stop.pickupTime}>{stop.pickupTime}</time>
              <button type="button" onClick={() => openCheckIn(stopIndex)}>
                Check in
              </button>

              {selectedStopIndex === stopIndex ? (
                <div>
                  <label htmlFor={`check-in-photo-${stopIndex}`}>Check-in photo</label>
                  <input
                    id={`check-in-photo-${stopIndex}`}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={isCheckingIn}
                    onChange={(event) => void handleCheckInPhoto(event)}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {checkInResult?.autoConfirmed === true ? (
        <p role="status">
          Checked in {confirmedStop?.dogName ?? checkInResult.dogId}.
        </p>
      ) : null}

      {checkInResult?.autoConfirmed === false ? (
        <fieldset>
          <legend>Which dog?</legend>
          {checkInResult.candidates.map((candidate) => {
            const stop = route?.stops.find((routeStop) => routeStop.dogId === candidate.dogId);
            return (
              <label key={candidate.dogId}>
                <input
                  type="radio"
                  name="check-in-dog"
                  value={candidate.dogId}
                  checked={selectedCandidateId === candidate.dogId}
                  onChange={() => setSelectedCandidateId(candidate.dogId)}
                />
                {stop?.dogName ?? candidate.dogId} ({Math.round(candidate.similarity * 100)}% match)
              </label>
            );
          })}
        </fieldset>
      ) : null}

      {checkInError !== null ? <p role="alert">{checkInError}</p> : null}
    </main>
  );
}
