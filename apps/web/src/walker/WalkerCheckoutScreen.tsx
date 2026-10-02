import { useEffect, useMemo, useState } from "react";
import {
  createCheckout,
  fetchRequestCheckout,
  rerunAiNote,
  sendCheckout,
  updateCheckoutNote,
  type WalkerCheckout,
} from "../lib/api.js";
import { formatWhen } from "../lib/format.js";
import { Avatar } from "../ui/Avatar.js";
import { Button } from "../ui/Button.js";

/**
 * The walker's checkout flow for one accepted request (S3).
 *
 * On mount it asks for the request's existing checkout: `null` opens the
 * upload form (1..3 photos with previews), a draft opens the edit view — the
 * walker's own `note` in the textarea (never the read-only `aiNote`), the AI
 * state with its exact text, the no-dog warning when the model saw nothing,
 * and Save note / Ask the AI again / Send to owner. Sending is the human
 * gate: only then does the owner see anything, and the checkout becomes
 * immutable.
 *
 * Every action is double-submit protected (buttons disable while in flight)
 * and every failure renders inline — nothing throws uncaught.
 */

const AI_STATE_TEXT: Record<WalkerCheckout["aiStatus"], string> = {
  ok: "AI observation draft — edit before sending.",
  unavailable: "The AI observation is unavailable; you can still send the photos.",
  quota: "Monthly AI limit reached; the note is yours alone.",
};

const NO_DOG_TEXT = "No dog detected in the photos. Check them before sending.";
const PHOTO_COUNT_TEXT = "Between 1 and 3 photos are required.";
const NOTE_TOO_LONG_TEXT = "The note must be 200 characters or less.";
const NOTE_MAX = 200;

type InFlight = "create" | "save" | "send" | "ai" | null;

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

export function WalkerCheckoutScreen({ requestId }: { requestId: string }) {
  const [checkout, setCheckout] = useState<WalkerCheckout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<File[]>([]);
  const [noteText, setNoteText] = useState("");
  const [inFlight, setInFlight] = useState<InFlight>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    void fetchRequestCheckout(requestId)
      .then((existing) => {
        if (!isMounted) {
          return;
        }
        setCheckout(existing);
        setNoteText(existing?.note ?? "");
        setLoadError(null);
      })
      .catch((loadError_: unknown) => {
        if (isMounted) {
          setLoadError(getErrorMessage(loadError_, "Unable to load the checkout."));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [requestId]);

  // Object URLs for the previews; revoked whenever the selection changes and
  // on unmount so a walker who picks and re-picks does not leak blobs.
  const previewUrls = useMemo(
    () => picked.map((file) => URL.createObjectURL(file)),
    [picked],
  );
  useEffect(
    () => () => {
      for (const url of previewUrls) {
        // Feature-checked: jsdom does not implement URL.revokeObjectURL (the
        // browser always does), and revoking is pure cleanup — it must never
        // be able to throw out of an unmount.
        if (typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(url);
        }
      }
    },
    [previewUrls],
  );

  async function handleCreate() {
    if (inFlight !== null) {
      return;
    }
    setError(null);
    setStatusMessage(null);
    if (picked.length < 1 || picked.length > 3) {
      setError(PHOTO_COUNT_TEXT);
      return;
    }
    setInFlight("create");
    try {
      const draft = await createCheckout(requestId, picked);
      setCheckout(draft);
      setNoteText(draft?.note ?? "");
      setPicked([]);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, "Unable to create the checkout."));
    } finally {
      setInFlight(null);
    }
  }

  async function handleSaveNote() {
    if (inFlight !== null || checkout === null) {
      return;
    }
    setError(null);
    setStatusMessage(null);
    if (noteText.length > NOTE_MAX) {
      setError(NOTE_TOO_LONG_TEXT);
      return;
    }
    setInFlight("save");
    try {
      // An empty textarea means "photos alone": the API's clear is `null`.
      const updated = await updateCheckoutNote(
        checkout.id,
        noteText.length === 0 ? null : noteText,
      );
      setCheckout(updated);
      setNoteText(updated?.note ?? "");
      setStatusMessage("Note saved.");
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, "Unable to save the note."));
    } finally {
      setInFlight(null);
    }
  }

  async function handleAskAiAgain() {
    if (inFlight !== null || checkout === null) {
      return;
    }
    setError(null);
    setStatusMessage(null);
    setInFlight("ai");
    try {
      const updated = await rerunAiNote(checkout.id);
      setCheckout(updated);
      // The server decides whether the walker's edited note survives (it
      // does) or follows the fresh observation (when untouched).
      setNoteText(updated?.note ?? "");
    } catch (aiError: unknown) {
      setError(getErrorMessage(aiError, "The AI re-run failed."));
    } finally {
      setInFlight(null);
    }
  }

  async function handleSend() {
    if (inFlight !== null || checkout === null) {
      return;
    }
    setError(null);
    setStatusMessage(null);
    setInFlight("send");
    try {
      const result = await sendCheckout(checkout.id);
      setCheckout({ ...checkout, status: "sent", sentAt: result?.sentAt ?? null });
      setStatusMessage("Sent to the owner.");
    } catch (sendError: unknown) {
      setError(getErrorMessage(sendError, "Unable to send the checkout."));
    } finally {
      setInFlight(null);
    }
  }

  if (isLoading) {
    return <p className="app-shell__status">Loading checkout...</p>;
  }

  return (
    <div className="checkout-screen">
      {error !== null ? (
        <p className="app-shell__alert" role="alert">
          {error}
        </p>
      ) : null}
      {statusMessage !== null ? (
        <p className="checkout-screen__status" role="status">
          {statusMessage}
        </p>
      ) : null}
      {loadError !== null ? (
        <p className="app-shell__alert" role="alert">
          {loadError}
        </p>
      ) : null}

      {loadError === null && checkout === null ? (
        <div className="checkout-screen__upload">
          <h2 className="section-title">Finish the walk</h2>
          <p className="checkout-screen__hint">
            Send the owner 1 to 3 photos of the dog. The AI drafts an
            observation you can edit — nothing reaches the owner until you
            press Send.
          </p>
          <label className="checkout-screen__label" htmlFor="checkout-photos">
            Checkout photos (1 to 3)
          </label>
          <input
            className="checkout-screen__file"
            id="checkout-photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => setPicked(Array.from(event.target.files ?? []))}
          />
          {previewUrls.length > 0 ? (
            <ul className="checkout-screen__previews" aria-label="Photo previews">
              {previewUrls.map((url, index) => (
                <li key={url + String(index)}>
                  <img
                    className="checkout-screen__preview"
                    src={url}
                    alt={`Preview of photo ${index + 1}`}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <Button onClick={() => void handleCreate()} disabled={inFlight !== null}>
            Create checkout
          </Button>
        </div>
      ) : null}

      {checkout !== null && checkout.status === "draft" ? (
        <div className="checkout-screen__draft">
          <h2 className="section-title">Draft for {checkout.dogName ?? "the walk"}</h2>
          <ul className="checkout-screen__photos" aria-label="Checkout photos">
            {checkout.photos.map((photo, index) => (
              <li key={photo.url}>
                <Avatar
                  src={photo.url}
                  alt={`Photo of ${checkout.dogName ?? "the dog"} ${index + 1}`}
                  size={72}
                />
              </li>
            ))}
          </ul>
          <p className="checkout-screen__ai">{AI_STATE_TEXT[checkout.aiStatus]}</p>
          {checkout.dogVisible === false ? (
            <p className="checkout-screen__warning">{NO_DOG_TEXT}</p>
          ) : null}
          <label className="checkout-screen__label" htmlFor="checkout-note">
            Note to owner
          </label>
          <textarea
            className="checkout-screen__note"
            id="checkout-note"
            rows={3}
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
          />
          <div className="checkout-screen__actions">
            <Button
              variant="secondary"
              onClick={() => void handleSaveNote()}
              disabled={inFlight !== null}
            >
              Save note
            </Button>
            <Button
              variant="ghost"
              onClick={() => void handleAskAiAgain()}
              disabled={inFlight !== null}
            >
              Ask the AI again
            </Button>
            <Button onClick={() => void handleSend()} disabled={inFlight !== null}>
              Send to owner
            </Button>
          </div>
        </div>
      ) : null}

      {checkout !== null && checkout.status === "sent" ? (
        <div className="checkout-screen__sent">
          <h2 className="section-title">Checkout sent</h2>
          <p className="checkout-screen__hint">
            The owner can see the photos and your note
            {checkout.sentAt !== null ? ` since ${formatWhen(checkout.sentAt)}` : ""}. A
            sent checkout cannot be changed.
          </p>
          <ul className="checkout-screen__photos" aria-label="Checkout photos">
            {checkout.photos.map((photo, index) => (
              <li key={photo.url}>
                <Avatar
                  src={photo.url}
                  alt={`Photo of ${checkout.dogName ?? "the dog"} ${index + 1}`}
                  size={72}
                />
              </li>
            ))}
          </ul>
          {checkout.note !== null ? (
            <p className="checkout-screen__sent-note">“{checkout.note}”</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
