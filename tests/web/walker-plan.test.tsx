// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// S2: the pickup-plan panel on the walker's Today tab. "Suggest order" calls
// suggestPlan({date, utcOffsetMinutes}) — the offset is the browser's, as
// -(new Date().getTimezoneOffset()) — and renders the ordered stops with
// formatted ETA (never raw ISO, polish item 3), leg distance, reactive flag
// and group number, plus the total distance. "Accept plan" reuses the
// EXISTING routes endpoint through createRoute(stops) with each stop's
// requestedTime as pickupTime; the plan itself is never persisted by the
// suggest call. Late stops (lateMinutes > 10) show "Late by N min" and an
// infeasible plan warns with the exact feasibility text. Both buttons get
// double-submit protection.

const mockSuggestPlan = vi.fn();
const mockCreateRoute = vi.fn();
vi.mock("../../apps/web/src/lib/api.js", () => ({
  suggestPlan: mockSuggestPlan,
  createRoute: mockCreateRoute,
}));

function loadScreen(path: string): Promise<any> {
  return import(/* @vite-ignore */ `../../apps/web/src/${path}.js`);
}

async function renderPanel() {
  const { WalkerPlanPanel } = await loadScreen("walker/WalkerPlanPanel");
  return render(<WalkerPlanPanel />);
}

function formatted(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

const STOP_OK = {
  requestId: "r-a", dogId: "dog-1", dogName: "Firulais",
  requestedTime: "2026-10-05T10:00:00+00:00", eta: "2026-10-05T10:00:00+00:00",
  legDistanceKm: 0, flags: [], group: 1, lateMinutes: 0, late: false,
};
// eta 11:06:43 for a 10:05 pickup -> lateMinutes 62 > threshold 10 -> late
const STOP_LATE = {
  requestId: "r-b", dogId: "dog-2", dogName: "Rex",
  requestedTime: "2026-10-05T10:05:00+00:00", eta: "2026-10-05T11:06:43+00:00",
  legDistanceKm: 1.11, flags: ["reactive"], group: 2, lateMinutes: 62, late: true,
};
const STOP_OK_2 = {
  ...STOP_LATE, eta: "2026-10-05T10:05:00+00:00", lateMinutes: 0, late: false,
};

const PLAN = {
  date: "2026-10-05", stops: [STOP_OK, STOP_LATE], totalDistanceKm: 1.11, feasible: false,
};
const PLAN_OK = {
  date: "2026-10-05", stops: [STOP_OK, STOP_OK_2], totalDistanceKm: 1.11, feasible: true,
};
const EMPTY_PLAN = { date: "2026-10-05", stops: [], totalDistanceKm: 0, feasible: true };

afterEach(cleanup);

describe("Walker plan panel (S2)", () => {
  beforeEach(() => {
    mockSuggestPlan.mockReset();
    mockCreateRoute.mockReset();
  });

  it("renders the date field and the Suggest order button", async () => {
    await renderPanel();
    expect(screen.getByLabelText("Plan date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggest order" })).toBeInTheDocument();
  });

  it("rejects suggesting without a date", async () => {
    const user = userEvent.setup();
    await renderPanel();
    await user.click(screen.getByRole("button", { name: "Suggest order" }));
    expect(await screen.findByText("Choose a plan date.")).toBeInTheDocument();
    expect(mockSuggestPlan).not.toHaveBeenCalled();
  });

  it("suggests with the chosen date and the browser UTC offset", async () => {
    mockSuggestPlan.mockResolvedValue(EMPTY_PLAN);
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByLabelText("Plan date"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Suggest order" }));

    await waitFor(() =>
      expect(mockSuggestPlan).toHaveBeenCalledWith({
        date: "2026-10-05",
        utcOffsetMinutes: -(new Date().getTimezoneOffset()),
      }),
    );
  });

  it("shows a planning state while the suggest is in flight", async () => {
    mockSuggestPlan.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByLabelText("Plan date"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Suggest order" }));

    expect(await screen.findByText("Planning...")).toBeInTheDocument();
  });

  it("disables Suggest order while in flight and calls the API exactly once", async () => {
    let resolveSuggest: (value: unknown) => void = () => {};
    mockSuggestPlan.mockImplementation(
      () => new Promise((resolve) => { resolveSuggest = resolve; }),
    );
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByLabelText("Plan date"), "2026-10-05");
    const suggest = screen.getByRole("button", { name: "Suggest order" });
    await user.click(suggest);
    await user.click(suggest);

    expect(mockSuggestPlan).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Suggest order" })).toBeDisabled();

    await act(async () => {
      resolveSuggest(EMPTY_PLAN);
    });
  });

  it("shows the error inline when the suggest fails", async () => {
    mockSuggestPlan.mockRejectedValue(new Error("date must be a valid YYYY-MM-DD date."));
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByLabelText("Plan date"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Suggest order" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "date must be a valid YYYY-MM-DD date.",
    );
  });

  it("shows the empty plan message and no Accept button", async () => {
    mockSuggestPlan.mockResolvedValue(EMPTY_PLAN);
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByLabelText("Plan date"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Suggest order" }));

    expect(
      await screen.findByText("No accepted requests for that day."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept plan" })).not.toBeInTheDocument();
  });

  it("renders the ordered stops with formatted etas, distances, flags and groups", async () => {
    mockSuggestPlan.mockResolvedValue(PLAN);
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByLabelText("Plan date"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Suggest order" }));

    expect(await screen.findByText("Firulais")).toBeInTheDocument();
    const rows = screen.getAllByTestId("plan-stop");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Firulais");
    expect(rows[1]).toHaveTextContent("Rex");

    expect(screen.getByText(formatted(PLAN.stops[0].eta))).toBeInTheDocument();
    expect(screen.getByText(formatted(PLAN.stops[1].eta))).toBeInTheDocument();
    expect(screen.queryByText(/2026-10-05T/)).not.toBeInTheDocument();

    expect(screen.getByText("1.11 km")).toBeInTheDocument();
    expect(screen.getByText("Total 1.11 km")).toBeInTheDocument();
    expect(screen.getByText("reactive")).toBeInTheDocument();
    expect(screen.getByText("Group 1")).toBeInTheDocument();
    expect(screen.getByText("Group 2")).toBeInTheDocument();

    // "Late by N min" only on the late stop
    expect(within(rows[1]).getByText("Late by 62 min")).toBeInTheDocument();
    expect(within(rows[0]).queryByText(/Late by/)).not.toBeInTheDocument();
  });

  it("warns with the exact text when the plan is not feasible", async () => {
    mockSuggestPlan.mockResolvedValue(PLAN);
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByLabelText("Plan date"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Suggest order" }));

    expect(await screen.findByText("Some pickups cannot be reached on time.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Some pickups cannot be reached on time.");
  });

  it("shows no warning and no late markers on a feasible plan", async () => {
    mockSuggestPlan.mockResolvedValue(PLAN_OK);
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByLabelText("Plan date"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Suggest order" }));

    expect(await screen.findByText("Firulais")).toBeInTheDocument();
    expect(
      screen.queryByText("Some pickups cannot be reached on time."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Late by/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("accepts the plan through createRoute with the existing routes contract", async () => {
    mockSuggestPlan.mockResolvedValue(PLAN_OK);
    mockCreateRoute.mockResolvedValue({ id: "route-9", stops: [] });
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByLabelText("Plan date"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Suggest order" }));
    await user.click(await screen.findByRole("button", { name: "Accept plan" }));

    await waitFor(() =>
      expect(mockCreateRoute).toHaveBeenCalledWith([
        { dogId: "dog-1", pickupTime: "2026-10-05T10:00:00+00:00" },
        { dogId: "dog-2", pickupTime: "2026-10-05T10:05:00+00:00" },
      ]),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Route created.");
  });

  it("disables Accept plan while in flight and calls the API exactly once", async () => {
    mockSuggestPlan.mockResolvedValue(PLAN_OK);
    let resolveCreate: (value: unknown) => void = () => {};
    mockCreateRoute.mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByLabelText("Plan date"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Suggest order" }));
    const accept = await screen.findByRole("button", { name: "Accept plan" });
    await user.click(accept);
    await user.click(accept);

    expect(mockCreateRoute).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Accept plan" })).toBeDisabled();

    await act(async () => {
      resolveCreate({ id: "route-9", stops: [] });
    });
  });

  it("shows the error inline when accepting the plan fails", async () => {
    mockSuggestPlan.mockResolvedValue(PLAN_OK);
    mockCreateRoute.mockRejectedValue(new Error("A route needs at least one stop."));
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByLabelText("Plan date"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Suggest order" }));
    await user.click(await screen.findByRole("button", { name: "Accept plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A route needs at least one stop.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
