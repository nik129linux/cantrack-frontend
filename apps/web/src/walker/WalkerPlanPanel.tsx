import { useState, type FormEvent } from "react";
import { createRoute, suggestPlan, type SuggestedPlan } from "../lib/api.js";
import { formatWhen } from "../lib/format.js";
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
 * S2: the pickup-plan panel on the walker's Today tab. "Suggest order" asks
 * the API for the plan of one local day (the browser sends its own UTC offset
 * as -(new Date().getTimezoneOffset())); the result is a suggestion — nothing
 * is persisted until "Accept plan" creates the route through the EXISTING
 * POST /routes. Etas render through formatWhen (never raw ISO), late stops
 * carry "Late by N min" and an infeasible plan warns with the exact text.
 * Both actions are protected against double submits.
 */
export function WalkerPlanPanel() {
  const [date, setDate] = useState("");
  const [plan, setPlan] = useState<SuggestedPlan | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isAccepted, setIsAccepted] = useState(false);

  async function handleSuggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (date.trim().length === 0) {
      setValidationError("Choose a plan date.");
      return;
    }

    setValidationError(null);
    setSuggestError(null);
    setPlan(null);
    setAcceptError(null);
    setIsAccepted(false);
    setIsSuggesting(true);
    try {
      const suggested = await suggestPlan({
        date,
        utcOffsetMinutes: -(new Date().getTimezoneOffset()),
      });
      setPlan(suggested);
    } catch (error: unknown) {
      setSuggestError(getErrorMessage(error, "Unable to suggest a plan."));
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleAccept() {
    if (plan === null) {
      return;
    }

    setIsAccepting(true);
    setAcceptError(null);
    setIsAccepted(false);
    try {
      await createRoute(
        plan.stops.map((stop) => ({
          dogId: stop.dogId,
          pickupTime: stop.requestedTime,
        })),
      );
      setIsAccepted(true);
    } catch (error: unknown) {
      setAcceptError(getErrorMessage(error, "Unable to create the route."));
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <section className="plan-panel" aria-labelledby="plan-panel-heading">
      <h2 className="section-title" id="plan-panel-heading">Pickup plan</h2>
      <form className="plan-panel__form" onSubmit={handleSuggest} noValidate>
        <div className="form-field">
          <label className="form-label" htmlFor="plan-date">Plan date</label>
          <input
            id="plan-date"
            className="form-input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={isSuggesting}>
          Suggest order
        </Button>
      </form>

      {validationError !== null ? (
        <p className="plan-panel__validation">{validationError}</p>
      ) : null}
      {isSuggesting ? <p className="app-shell__status">Planning...</p> : null}
      {suggestError !== null ? <Toast tone="error" message={suggestError} /> : null}

      {plan !== null && plan.stops.length === 0 ? (
        <p className="plan-panel__empty">No accepted requests for that day.</p>
      ) : null}

      {plan !== null && plan.stops.length > 0 ? (
        <>
          {plan.feasible ? null : (
            <Toast tone="error" message="Some pickups cannot be reached on time." />
          )}
          <ol className="plan-stops">
            {plan.stops.map((stop) => (
              <li className="plan-stop" data-testid="plan-stop" key={stop.requestId}>
                <div className="plan-stop__head">
                  <strong className="plan-stop__name">{stop.dogName}</strong>
                  <span className="plan-stop__group">Group {stop.group}</span>
                </div>
                <p className="plan-stop__meta">
                  <time dateTime={stop.eta}>{formatWhen(stop.eta)}</time>
                  <span aria-hidden="true"> · </span>
                  <span>{stop.legDistanceKm} km</span>
                </p>
                <div className="plan-stop__flags">
                  {stop.flags.map((flag) => (
                    <span className="plan-stop__flag" key={flag}>
                      {flag}
                    </span>
                  ))}
                  {stop.late ? (
                    <span className="plan-stop__late">Late by {stop.lateMinutes} min</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="plan-total">Total {plan.totalDistanceKm} km</p>
          <Button onClick={() => void handleAccept()} disabled={isAccepting}>
            Accept plan
          </Button>
        </>
      ) : null}

      {acceptError !== null ? <Toast tone="error" message={acceptError} /> : null}
      {isAccepted ? <Toast tone="success" message="Route created." /> : null}
    </section>
  );
}
