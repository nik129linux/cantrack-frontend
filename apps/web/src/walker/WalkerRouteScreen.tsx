import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  checkIn,
  confirmCheckIn,
  fetchRoute,
  undoCheckIn,
  type AiNote,
  type CheckInCandidate,
  type CheckInResult,
  type Route,
} from "../lib/api.js";

/** The check-in outcome as the screen shows it, whichever way it was decided. */
type CheckInView =
  | { kind: "confirmed"; dogId: string; dogName: string | null; note: string | null }
  | { kind: "candidates"; candidates: CheckInCandidate[]; note: string | null };

const routeToneNames = ["mint", "coral", "yellow", "sky", "green"] as const;

function getRouteStopToneClass(index: number): string {
  return `route-stop--${routeToneNames[index % routeToneNames.length] ?? "mint"}`;
}

function RouteStopIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="5" />
      <path d="M32 19v14l10 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
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

function readAiNote(ai: AiNote | null | undefined): string | null {
  const note = ai?.note;
  return typeof note === "string" && note.trim().length > 0 ? note : null;
}

function toCheckInView(result: CheckInResult): CheckInView {
  const note = readAiNote(result.ai);

  if (result.autoConfirmed) {
    return { kind: "confirmed", dogId: result.dogId, dogName: result.dogName, note };
  }

  return { kind: "candidates", candidates: result.candidates, note };
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
  const [checkInResult, setCheckInResult] = useState<CheckInView | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
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
    setConfirmError(null);
  }

  async function handleCheckInPhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.currentTarget.files?.[0];
    if (photo === undefined) {
      return;
    }

    setIsCheckingIn(true);
    setCheckInError(null);
    setConfirmError(null);
    setCheckInResult(null);
    setSelectedCandidateId(null);

    try {
      const result = await checkIn(routeId, photo);
      setCheckInResult(toCheckInView(result));
    } catch (error: unknown) {
      setCheckInError(getErrorMessage(error, "Unable to check in."));
    } finally {
      setIsCheckingIn(false);
    }
  }

  async function handleConfirmCandidate() {
    if (selectedCandidateId === null) {
      return;
    }

    const note = checkInResult?.note ?? null;
    setIsConfirming(true);
    setConfirmError(null);
    try {
      const confirmed = await confirmCheckIn(routeId, selectedCandidateId);
      setCheckInResult({
        kind: "confirmed",
        dogId: confirmed.dogId,
        dogName: confirmed.dogName,
        note,
      });
      setSelectedCandidateId(null);
    } catch (error: unknown) {
      setConfirmError(getErrorMessage(error, "Unable to confirm the check-in."));
    } finally {
      setIsConfirming(false);
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

  function stopDogName(dogId: string): string | null {
    return route?.stops.find((stop) => stop.dogId === dogId)?.dogName ?? null;
  }

  return (
    <main ref={screenRef} className="walker-screen" data-cantrack-walker-route-screen>
      <header className="walker-screen__header">
        <h1>Walker route</h1>
        <span className="walker-screen__illustration" aria-hidden="true">
          <RouteStopIcon />
        </span>
      </header>
      <div className="walker-screen__tools">
        <button
          className="form-button form-button--secondary"
          type="button"
          onClick={() => void handleUndo()}
          disabled={isUndoing}
        >
          Undo
        </button>
      </div>
      {undoMessage !== null ? <p role="status">{undoMessage}</p> : null}
      {undoError !== null ? <p role="alert">{undoError}</p> : null}

      {isLoading ? <p>Loading route...</p> : null}
      {routeError !== null ? <p role="alert">{routeError}</p> : null}

      {route !== null ? (
        <ol aria-label="Route stops">
          {route.stops.map((stop, stopIndex) => (
            <li
              className={`route-stop ${getRouteStopToneClass(stopIndex)}`}
              data-testid="route-stop"
              key={`${stop.dogId}-${stopIndex}`}
            >
              <div className="route-stop__row">
                <span className="route-stop__icon" aria-hidden="true">
                  <RouteStopIcon />
                </span>
                <div className="route-stop__copy">
                  <strong>{stop.dogName ?? stop.dogId}</strong>
                  <time dateTime={stop.pickupTime}>{stop.pickupTime}</time>
                </div>
              </div>
              <button
                className="form-button form-button--primary"
                type="button"
                onClick={() => openCheckIn(stopIndex)}
              >
                Check in
              </button>

              {selectedStopIndex === stopIndex ? (
                <div className="form-field">
                  <label className="form-label" htmlFor={`check-in-photo-${stopIndex}`}>Check-in photo</label>
                  <input
                    id={`check-in-photo-${stopIndex}`}
                    className="form-file"
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

      {checkInResult?.kind === "confirmed" ? (
        <>
          <p role="status">
            Checked in {checkInResult.dogName ?? stopDogName(checkInResult.dogId) ?? checkInResult.dogId}.
          </p>
          {checkInResult.note !== null ? <p>{checkInResult.note}</p> : null}
        </>
      ) : null}

      {checkInResult?.kind === "candidates" ? (
        <>
          <fieldset className="choice-picker">
            <legend>Which dog?</legend>
            {checkInResult.candidates.map((candidate) => (
              <label className="choice-chip" key={candidate.dogId}>
                <input
                  className="choice-chip__input"
                  type="radio"
                  name="check-in-dog"
                  value={candidate.dogId}
                  checked={selectedCandidateId === candidate.dogId}
                  onChange={() => setSelectedCandidateId(candidate.dogId)}
                />
                {candidate.dogName ?? stopDogName(candidate.dogId) ?? candidate.dogId} ({Math.round(candidate.similarity * 100)}% match)
              </label>
            ))}
            <button
              className="form-button form-button--primary"
              type="button"
              onClick={() => void handleConfirmCandidate()}
              disabled={selectedCandidateId === null || isConfirming}
            >
              Confirm
            </button>
          </fieldset>
          {confirmError !== null ? <p role="alert">{confirmError}</p> : null}
          {checkInResult.note !== null ? <p>{checkInResult.note}</p> : null}
        </>
      ) : null}

      {checkInError !== null ? <p role="alert">{checkInError}</p> : null}
    </main>
  );
}
