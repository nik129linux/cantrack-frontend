// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const mockFetchOwnerStats = vi.fn();
const mockFetchOwnerWalks = vi.fn();
const mockFetchWalkSummary = vi.fn();

vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchOwnerStats: mockFetchOwnerStats,
  fetchOwnerWalks: mockFetchOwnerWalks,
  fetchWalkSummary: mockFetchWalkSummary,
}));

const EMPTY_STATS = {
  walksByMonth: [],
  checkoutsReceived: 0,
  distinctWalkers: 0,
};

const STATS = {
  walksByMonth: [
    { month: "2026-05", count: 0 },
    { month: "2026-06", count: 0 },
    { month: "2026-07", count: 0 },
    { month: "2026-08", count: 0 },
    { month: "2026-09", count: 1 },
    { month: "2026-10", count: 2 },
  ],
  checkoutsReceived: 3,
  distinctWalkers: 2,
};

const WALK = {
  id: "walk-1",
  status: "assigned",
  dogId: "dog-1",
  dogName: "Luna",
  walkerId: "walker-1",
  walkerName: "Mateo",
  requestedTime: "2099-01-02T22:00:00+00:00",
  durationHours: 1,
  priceCop: 15000,
  canRate: false,
  hasReport: false,
};

async function renderWalks() {
  const { OwnerWalksScreen } = await import("../../apps/web/src/owner/OwnerWalksScreen.js");
  return render(<OwnerWalksScreen userId="owner-1" />);
}

afterEach(cleanup);

describe("Owner statistics panel (FR-22)", () => {
  beforeEach(() => {
    mockFetchOwnerStats.mockReset();
    mockFetchOwnerWalks.mockReset();
    mockFetchWalkSummary.mockReset();
    mockFetchOwnerStats.mockResolvedValue(EMPTY_STATS);
    mockFetchOwnerWalks.mockResolvedValue({ items: [WALK], nextCursor: null });
    mockFetchWalkSummary.mockResolvedValue({
      month: { walks: 0, km: 0, minutes: 0 },
      counts: { upcoming: 1, active: 0, past: 0 },
    });
  });

  it("shows a loading state while owner statistics load", async () => {
    mockFetchOwnerStats.mockReturnValue(new Promise(() => {}));

    await renderWalks();

    expect(screen.getByRole("status", { name: "Loading statistics..." })).toBeInTheDocument();
  });

  it("shows the exact monthly chart and metric values", async () => {
    mockFetchOwnerStats.mockResolvedValue(STATS);

    await renderWalks();

    expect(await screen.findByRole("img", { name: "Walks by month" })).toBeInTheDocument();
    expect(screen.getByText("May 2026: 0 walks")).toBeInTheDocument();
    expect(screen.getByText("June 2026: 0 walks")).toBeInTheDocument();
    expect(screen.getByText("July 2026: 0 walks")).toBeInTheDocument();
    expect(screen.getByText("August 2026: 0 walks")).toBeInTheDocument();
    expect(screen.getByText("October 2026: 2 walks")).toBeInTheDocument();
    expect(screen.getByText("September 2026: 1 walk")).toBeInTheDocument();
    const checkouts = screen.getByText("Checkouts received").parentElement;
    const walkers = screen.getByText("Distinct walkers").parentElement;
    expect(within(checkouts!).getByText("3")).toBeInTheDocument();
    expect(within(walkers!).getByText("2")).toBeInTheDocument();
    expect(mockFetchOwnerStats).toHaveBeenCalledExactlyOnceWith("owner-1");
  });

  it("shows an empty state when no statistics exist", async () => {
    await renderWalks();

    expect(await screen.findByText("No statistics available yet.")).toBeInTheDocument();
  });

  it("shows a statistics error without hiding the walk list", async () => {
    mockFetchOwnerStats.mockRejectedValue(new Error("Statistics unavailable."));

    await renderWalks();

    expect(await screen.findByRole("alert")).toHaveTextContent(/^Statistics unavailable\.$/);
    expect(screen.getByRole("button", { name: /Luna/ })).toBeInTheDocument();
  });
});
