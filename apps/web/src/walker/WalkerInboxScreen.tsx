import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  acceptRequest,
  declineRequest,
  fetchRequest,
  fetchRequests,
  type RequestConflict,
  type WalkerRequestView,
} from "../lib/api.js";
import { Badge } from "../ui/Badge.js";
import { Banner } from "../ui/Banner.js";
import { Button } from "../ui/Button.js";
import { EmptyState } from "../ui/EmptyState.js";
import { ListRow } from "../ui/ListRow.js";
import { Toast } from "../ui/Toast.js";
import { PawIcon } from "../ui/icons.js";

// S3: the checkout flow lives behind a lazy boundary on purpose — it is only
// loaded when a walker actually opens it from an accepted request, which
// keeps this screen's module graph (and its api imports) exactly as small
// as before for everybody else.
const WalkerCheckoutScreen = lazy(() =>
  import("./WalkerCheckoutScreen.js").then((module) => ({
    default: module.WalkerCheckoutScreen,
  })),
);

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
 * The walker's inbox (S1): every request addressed to them, pending oldest
 * first (the API orders it through the hand-written Queue). Opening a request
 * shows exactly what the API allows for its status — while it is not accepted
 * that is the limited dog view (name, breed, size, temperament): no pin, no
 * allergies, no contacts. Accept/Decline act on pending requests only; an
 * accept that overlaps other accepted walks comes back with `conflicts`, which
 * are surfaced as an alert (flagged, not blocked).
 */
export function WalkerInboxScreen() {
  const [items, setItems] = useState<WalkerRequestView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [detail, setDetail] = useState<WalkerRequestView | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<"accept" | "decline" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<RequestConflict[]>([]);
  // S3: the accepted request whose checkout flow is open (lazy-loaded below).
  const [checkOutFor, setCheckOutFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchRequests<WalkerRequestView>();
      setItems(data);
      setListError(null);
    } catch (error: unknown) {
      setListError(getErrorMessage(error, "Unable to load your requests."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(requestId: string) {
    setDetail(null);
    setDetailError(null);
    setActionError(null);
    setStatusMessage(null);
    setConflicts([]);
    setCheckOutFor(null);
    setIsDetailLoading(true);
    try {
      const loaded = await fetchRequest<WalkerRequestView>(requestId);
      setDetail(loaded);
    } catch (error: unknown) {
      setDetailError(getErrorMessage(error, "Unable to open the request."));
    } finally {
      setIsDetailLoading(false);
    }
  }

  function backToList() {
    setDetail(null);
    setDetailError(null);
    setActionError(null);
    setCheckOutFor(null);
  }

  async function handleAccept() {
    if (detail === null || actionInFlight !== null) {
      return;
    }

    setActionInFlight("accept");
    setActionError(null);
    setStatusMessage(null);
    setConflicts([]);
    try {
      const result = await acceptRequest(detail.id);
      setConflicts(result.conflicts ?? []);
      setStatusMessage("Request accepted.");
      setDetail(null);
      await load();
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, "Unable to accept the request."));
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleDecline() {
    if (detail === null || actionInFlight !== null) {
      return;
    }

    setActionInFlight("decline");
    setActionError(null);
    setStatusMessage(null);
    setConflicts([]);
    try {
      await declineRequest(detail.id);
      setStatusMessage("Request declined.");
      setDetail(null);
      await load();
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, "Unable to decline the request."));
    } finally {
      setActionInFlight(null);
    }
  }

  const conflictMessage =
    conflicts.length > 0
      ? `Time conflict with: ${conflicts
          .map((conflict) => conflict.requestedTime)
          .join(", ")}. The walk was accepted anyway — reorder or cancel if needed.`
      : null;

  return (
    <div className="inbox-screen">
      <Banner title="Requests" subtitle="Pending first, oldest on top." tint="peach" />

      {statusMessage !== null ? <Toast tone="success" message={statusMessage} /> : null}
      {conflictMessage !== null ? <Toast tone="error" message={conflictMessage} /> : null}
      {actionError !== null ? <Toast tone="error" message={actionError} /> : null}
      {listError !== null ? <Toast tone="error" message={listError} /> : null}
      {detailError !== null ? <Toast tone="error" message={detailError} /> : null}

      {isLoading ? <p className="app-shell__status">Loading requests...</p> : null}

      {detail === null && !isLoading && listError === null && items.length === 0 ? (
        <EmptyState title="No requests yet" message="New walk requests from owners will show up here." />
      ) : null}

      {detail === null && items.length > 0 ? (
        <ul className="inbox-list">
          {items.map((item) => (
            <li key={item.id}>
              <ListRow
                icon={<PawIcon />}
                title={item.dog.name ?? "Unknown dog"}
                subtitle={item.requestedTime}
                trailing={<Badge status={item.status} />}
                onClick={() => void openDetail(item.id)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {detail !== null ? (
        <div className="inbox-detail">
          <Button className="inbox-detail__back" variant="ghost" onClick={backToList}>
            <span aria-hidden="true">←</span> Inbox
          </Button>
          <h2 className="section-title">
            {detail.dog.name ?? "Unknown dog"} · <Badge status={detail.status} />
          </h2>
          <div className="ui-detail">
            <div className="ui-detail__row">
              <span className="ui-detail__label">When</span>
              <span className="ui-detail__value">{detail.requestedTime}</span>
            </div>
            <div className="ui-detail__row">
              <span className="ui-detail__label">Price</span>
              <span className="ui-detail__value">{detail.priceCop} COP</span>
            </div>
            <div className="ui-detail__row">
              <span className="ui-detail__label">Breed</span>
              <span className="ui-detail__value">{detail.dog.breed ?? "—"}</span>
            </div>
            <div className="ui-detail__row">
              <span className="ui-detail__label">Size</span>
              <span className="ui-detail__value">{detail.dog.size ?? "—"}</span>
            </div>
            <div className="ui-detail__row">
              <span className="ui-detail__label">Temperament</span>
              <span className="ui-detail__value">{detail.dog.temperament ?? "—"}</span>
            </div>
            {detail.status === "accepted" ? (
              <>
                <div className="ui-detail__row">
                  <span className="ui-detail__label">Energy</span>
                  <span className="ui-detail__value">{detail.dog.energy ?? "—"}</span>
                </div>
                <div className="ui-detail__row">
                  <span className="ui-detail__label">Leash trained</span>
                  <span className="ui-detail__value">
                    {detail.dog.leashTrained === true ? "Yes" : detail.dog.leashTrained === false ? "No" : "—"}
                  </span>
                </div>
                <div className="ui-detail__row">
                  <span className="ui-detail__label">Allergies</span>
                  <span className="ui-detail__value">{detail.dog.allergies ?? "—"}</span>
                </div>
                <div className="ui-detail__row">
                  <span className="ui-detail__label">Medical notes</span>
                  <span className="ui-detail__value">{detail.dog.medicalNotes ?? "—"}</span>
                </div>
                <div className="ui-detail__row">
                  <span className="ui-detail__label">Vet contact</span>
                  <span className="ui-detail__value">{detail.dog.vetContact ?? "—"}</span>
                </div>
                <div className="ui-detail__row">
                  <span className="ui-detail__label">Emergency contact</span>
                  <span className="ui-detail__value">{detail.dog.emergencyContact ?? "—"}</span>
                </div>
                <div className="ui-detail__row">
                  <span className="ui-detail__label">Pickup pin</span>
                  <span className="ui-detail__value">
                    {detail.pickupLat}, {detail.pickupLng}
                  </span>
                </div>
              </>
            ) : null}
          </div>
          {detail.status === "pending" ? (
            <div className="inbox-detail__actions">
              <Button onClick={() => void handleAccept()} disabled={actionInFlight !== null}>
                Accept
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleDecline()}
                disabled={actionInFlight !== null}
              >
                Decline
              </Button>
            </div>
          ) : null}
          {detail.status === "accepted" ? (
            <div className="inbox-detail__actions">
              <Button
                variant="secondary"
                onClick={() =>
                  setCheckOutFor((current) => (current === null ? detail.id : null))
                }
              >
                {checkOutFor === null ? "Check out" : "Close checkout"}
              </Button>
            </div>
          ) : null}
          {checkOutFor !== null ? (
            <Suspense
              fallback={<p className="app-shell__status">Loading checkout...</p>}
            >
              <WalkerCheckoutScreen requestId={checkOutFor} />
            </Suspense>
          ) : null}
        </div>
      ) : null}

      {isDetailLoading ? <p className="app-shell__status">Loading request...</p> : null}
    </div>
  );
}
