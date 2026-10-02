import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCheckouts,
  fetchDogs,
  fetchTimeline,
  type Dog,
  type OwnerCheckout,
  type TimelineItem,
  type TimelineOrder,
} from "../lib/api.js";
import { formatWhen } from "../lib/format.js";
import { Avatar } from "../ui/Avatar.js";
import { Banner } from "../ui/Banner.js";
import { EmptyState } from "../ui/EmptyState.js";
import { Pill } from "../ui/Pill.js";
import { Toast } from "../ui/Toast.js";
import { PawIcon } from "../ui/icons.js";

/**
 * The owner's Activity tab (S3): the SENT checkouts, newest first, and the
 * per-dog timeline (walks + sent checkouts mixed in time order).
 *
 * The list refreshes every 10 s while the screen is mounted — and stops the
 * moment it unmounts — because a checkout arrives whenever the walker
 * presses Send, with no push channel on the free tier. A poll that brings an
 * id nobody has seen raises a Toast naming the walker. Drafts never reach
 * this screen: the API hides them until they are sent.
 *
 * No raw ISO strings anywhere: every visible time goes through `formatWhen`
 * and the machine value stays in `<time dateTime>`.
 */

const POLL_INTERVAL_MS = 10_000;

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

export function OwnerActivityScreen() {
  const [checkouts, setCheckouts] = useState<OwnerCheckout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [order, setOrder] = useState<TimelineOrder>("desc");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  // Ids the polls have already reported; `null` until the first load, which
  // must never toast (everything in it is "new").
  const seenIds = useRef<Set<string> | null>(null);

  const loadCheckouts = useCallback(async () => {
    try {
      const rows = await fetchCheckouts();
      const seen = seenIds.current;
      if (seen !== null) {
        const fresh = rows.filter((row) => !seen.has(row.id));
        if (fresh.length > 0) {
          setToast(`New checkout from ${fresh[0].walkerName ?? "your walker"}`);
        }
      }
      seenIds.current = new Set(rows.map((row) => row.id));
      setCheckouts(rows);
      setListError(null);
    } catch (error: unknown) {
      setListError(getErrorMessage(error, "Unable to load your activity."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCheckouts();
    const timer = setInterval(() => void loadCheckouts(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadCheckouts]);

  useEffect(() => {
    let isMounted = true;
    void fetchDogs()
      .then((loaded) => {
        if (!isMounted) {
          return;
        }
        setDogs(loaded);
        setSelectedDogId((current) => current ?? loaded[0]?.id ?? null);
      })
      .catch(() => {
        // The timeline is a complement; a failed dog list only hides it.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedDogId === null) {
      setTimeline([]);
      return;
    }
    let isMounted = true;
    void fetchTimeline(selectedDogId, order)
      .then((items) => {
        if (isMounted) {
          setTimeline(items);
          setTimelineError(null);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setTimelineError(getErrorMessage(error, "Unable to load the timeline."));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedDogId, order]);

  const selectedDog = dogs.find((dog) => dog.id === selectedDogId) ?? null;

  return (
    <div className="activity-screen">
      <Banner
        title="Activity"
        subtitle="Checkouts from your walkers, newest first."
        tint="sky"
      />

      {toast !== null ? (
        <Toast tone="success" message={toast} onDismiss={() => setToast(null)} />
      ) : null}
      {listError !== null ? (
        <p className="app-shell__alert" role="alert">
          {listError}
        </p>
      ) : null}
      {isLoading ? <p className="app-shell__status">Loading activity...</p> : null}

      {!isLoading && listError === null && checkouts.length === 0 ? (
        <EmptyState
          title="No checkouts yet."
          message="Photos and notes from your walkers appear here once they send them."
        />
      ) : null}

      {checkouts.length > 0 ? (
        <ul className="activity-list" aria-label="Sent checkouts">
          {checkouts.map((checkout) => (
            <li key={checkout.id} className="activity-card">
              {checkout.photos.length > 0 ? (
                <ul className="activity-card__photos">
                  {checkout.photos.map((photo) => (
                    <li key={photo.url}>
                      <Avatar
                        src={photo.url}
                        alt={`Photo of ${checkout.dogName ?? "the dog"}`}
                        size={72}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="activity-card__body">
                <p className="activity-card__title">
                  {checkout.dogName ?? "Your dog"} ·{" "}
                  <span className="activity-card__walker">{checkout.walkerName}</span>
                </p>
                {checkout.note !== null ? (
                  <p className="activity-card__note">{checkout.note}</p>
                ) : (
                  <p className="activity-card__note activity-card__note--empty">
                    Photos only — no note.
                  </p>
                )}
                <p className="activity-card__time">
                  <time dateTime={checkout.sentAt}>{formatWhen(checkout.sentAt)}</time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {selectedDogId !== null ? (
        <section className="activity-timeline" aria-label="Dog timeline">
          <h2 className="section-title">
            <span className="activity-timeline__icon" aria-hidden="true">
              <PawIcon />
            </span>
            {selectedDog?.name ?? "Your dog"}’s timeline
          </h2>
          {dogs.length > 1 ? (
            <nav className="activity-timeline__dogs" aria-label="Choose a dog">
              {dogs.map((dog) => (
                <Pill
                  key={dog.id}
                  active={dog.id === selectedDogId}
                  onClick={() => setSelectedDogId(dog.id)}
                >
                  {dog.name}
                </Pill>
              ))}
            </nav>
          ) : null}
          <div className="activity-timeline__order" role="group" aria-label="Timeline order">
            <Pill active={order === "desc"} onClick={() => setOrder("desc")}>
              Newest first
            </Pill>
            <Pill active={order === "asc"} onClick={() => setOrder("asc")}>
              Oldest first
            </Pill>
          </div>
          {timelineError !== null ? (
            <p className="app-shell__alert" role="alert">
              {timelineError}
            </p>
          ) : null}
          {timeline.length === 0 && timelineError === null ? (
            <p className="app-shell__status">Nothing on the timeline yet.</p>
          ) : null}
          {timeline.length > 0 ? (
            <ol className="activity-timeline__items">
              {timeline.map((item) => (
                <li
                  key={item.type === "walk" ? `walk-${item.requestId}` : `checkout-${item.checkoutId}`}
                  data-testid="timeline-item"
                  className="activity-timeline__item"
                >
                  <span className="activity-timeline__label">
                    {item.type === "walk" ? "Walk" : "Checkout"} · {item.walkerName}
                  </span>
                  <span className="activity-timeline__when">
                    {item.type === "walk" ? (
                      <time dateTime={item.requestedTime}>
                        {formatWhen(item.requestedTime)}
                      </time>
                    ) : (
                      <time dateTime={item.sentAt}>{formatWhen(item.sentAt)}</time>
                    )}
                  </span>
                  {item.type === "checkout" && item.note !== null ? (
                    <span className="activity-timeline__note">“{item.note}”</span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
