// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// S3: the owner's Activity tab (OwnerActivityScreen). It lists the owner's
// SENT checkouts (newest first), polls every 10 s while mounted (and stops
// after unmount), raises a Toast "New checkout from {walkerName}" when a new
// one arrives, shows each dog's timeline (walks + sent checkouts mixed in
// time order) with an asc/desc toggle, and never renders raw ISO strings
// (formatWhen everywhere; the machine value stays in dateTime/attrs).

const mockFetchCheckouts = vi.fn();
const mockFetchTimeline = vi.fn();
const mockFetchDogs = vi.fn();
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchCheckouts: mockFetchCheckouts,
  fetchTimeline: mockFetchTimeline,
  fetchDogs: mockFetchDogs,
}));

function loadScreen(path: string): Promise<any> {
  return import(/* @vite-ignore */ `../../apps/web/src/${path}.js`);
}

async function renderActivity() {
  const { OwnerActivityScreen } = await loadScreen("owner/OwnerActivityScreen");
  return render(<OwnerActivityScreen />);
}

function formatted(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

const CHECKOUT_A = {
  id: "c-1",
  requestId: "r-1",
  dogId: "dog-1",
  dogName: "Firulais",
  walkerId: "walker-w",
  walkerName: "Nico Walks",
  note: "Calm and clean.",
  photos: [{ url: "https://supabase.example/signed/x/1.png?expires=3600", expiresIn: 3600 }],
  sentAt: "2026-10-05T15:00:00+00:00",
};

const CHECKOUT_B = {
  id: "c-2",
  requestId: "r-2",
  dogId: "dog-1",
  dogName: "Firulais",
  walkerId: "walker-w2",
  walkerName: "Ana Packs",
  note: "Slept all the way.",
  photos: [],
  sentAt: "2026-10-06T15:00:00+00:00",
};

const WALK_ITEM = {
  type: "walk",
  requestId: "r-0",
  walkerId: "walker-w",
  walkerName: "Nico Walks",
  requestedTime: "2026-10-05T10:00:00+00:00",
  status: "accepted",
};

const CHECKOUT_ITEM = {
  type: "checkout",
  checkoutId: "c-1",
  requestId: "r-1",
  walkerId: "walker-w",
  walkerName: "Nico Walks",
  note: "Calm and clean.",
  sentAt: "2026-10-05T15:00:00+00:00",
};

afterEach(cleanup);

describe("Owner activity screen (S3)", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockFetchCheckouts.mockReset();
    mockFetchTimeline.mockReset();
    mockFetchDogs.mockReset();
    mockFetchCheckouts.mockResolvedValue([]);
    mockFetchTimeline.mockResolvedValue([]);
    mockFetchDogs.mockResolvedValue([{ id: "dog-1", name: "Firulais", breed: "Mixed" }]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a loading state while the activity loads", async () => {
    mockFetchCheckouts.mockReturnValue(new Promise(() => {}));
    await renderActivity();
    expect(screen.getByText("Loading activity...")).toBeInTheDocument();
  });

  it("shows the error inline when the list fails to load", async () => {
    mockFetchCheckouts.mockRejectedValue(new Error("Boom"));
    await renderActivity();
    expect(await screen.findByRole("alert")).toHaveTextContent("Boom");
  });

  it("shows the empty state when there are no checkouts yet", async () => {
    await renderActivity();
    expect(await screen.findByRole("heading", { name: "No checkouts yet." })).toBeInTheDocument();
  });

  it("lists sent checkouts with note, walker, formatted time and photo", async () => {
    mockFetchCheckouts.mockResolvedValue([CHECKOUT_A]);
    await renderActivity();

    expect(await screen.findByText("Calm and clean.")).toBeInTheDocument();
    expect(screen.getByText("Nico Walks")).toBeInTheDocument();
    expect(screen.getByText(formatted(CHECKOUT_A.sentAt))).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Photo of Firulais" })).toHaveAttribute(
      "src",
      "https://supabase.example/signed/x/1.png?expires=3600",
    );
    expect(screen.queryByText(/2026-10-05T/)).not.toBeInTheDocument();
  });

  it("replaces a broken photo with a placeholder of the same name", async () => {
    mockFetchCheckouts.mockResolvedValue([CHECKOUT_A]);
    const { container } = await renderActivity();

    const image = await screen.findByRole("img", { name: "Photo of Firulais" });
    fireEvent.error(image);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Photo of Firulais" })).toBeInTheDocument();
  });

  it("polls every 10 s and stops after unmount", async () => {
    vi.useFakeTimers();
    mockFetchCheckouts.mockResolvedValue([CHECKOUT_A]);
    const view = await renderActivity();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetchCheckouts).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(9_999);
    });
    expect(mockFetchCheckouts).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(mockFetchCheckouts).toHaveBeenCalledTimes(2);

    view.unmount();
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(mockFetchCheckouts).toHaveBeenCalledTimes(2);
  });

  it("raises the toast when a new checkout arrives on a poll", async () => {
    vi.useFakeTimers();
    mockFetchCheckouts.mockResolvedValueOnce([CHECKOUT_A]);
    mockFetchCheckouts.mockResolvedValue([CHECKOUT_A, CHECKOUT_B]);
    await renderActivity();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(/New checkout from/)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    // getByText, not findByText: the act() above has already committed the
    // toast, and RTL v16's asyncWrapper drains via setTimeout(0) that it only
    // auto-advances for JEST fake timers — under vi.useFakeTimers() ANY
    // findBy* hangs forever even when the element is present (reproduced with
    // a bare waitFor(getByText) on an existing element). Same assertion,
    // synchronous.
    expect(screen.getByText("New checkout from Ana Packs")).toBeInTheDocument();
  });

  it("shows the dog timeline newest first and toggles to oldest first", async () => {
    mockFetchCheckouts.mockResolvedValue([CHECKOUT_A]);
    mockFetchTimeline
      .mockResolvedValueOnce([CHECKOUT_ITEM, WALK_ITEM])
      .mockResolvedValueOnce([WALK_ITEM, CHECKOUT_ITEM]);
    const user = userEvent.setup();
    await renderActivity();

    // findAll, not find: the feed has TWO items and findByTestId throws on
    // multiple matches — while the getAllByTestId right below indexes [0]
    // and [1]. The pair was unsatisfiable as written.
    await screen.findAllByTestId("timeline-item");
    expect(mockFetchTimeline).toHaveBeenCalledWith("dog-1", "desc");
    let items = screen.getAllByTestId("timeline-item");
    expect(items[0]).toHaveTextContent(/Checkout ·/);
    expect(items[1]).toHaveTextContent(/Walk ·/);
    expect(screen.getByText(formatted(WALK_ITEM.requestedTime))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Oldest first" }));
    expect(mockFetchTimeline).toHaveBeenLastCalledWith("dog-1", "asc");
    items = screen.getAllByTestId("timeline-item");
    expect(items[0]).toHaveTextContent(/Walk ·/);
    expect(items[1]).toHaveTextContent(/Checkout ·/);
    expect(screen.getByRole("button", { name: "Oldest first" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("never renders raw ISO timestamps in the timeline", async () => {
    mockFetchCheckouts.mockResolvedValue([CHECKOUT_A]);
    mockFetchTimeline.mockResolvedValue([CHECKOUT_ITEM, WALK_ITEM]);
    await renderActivity();
    await screen.findAllByTestId("timeline-item"); // two items: find* would throw
    expect(screen.queryByText(/2026-10-05T/)).not.toBeInTheDocument();
  });
});
