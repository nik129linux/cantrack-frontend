// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
// Separate import line on purpose: the S0 additions below need `within` and the
// existing lines of this file stay byte-identical (no existing test touched).
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The app shell: routes between the auth screens (logged out) and a
// role-based dashboard (logged in) — owner sees OwnerDogsScreen, walker sees
// a list of their routes (fetchRoutes) that links into WalkerRouteScreen by
// id. This is the piece that actually mounts the app; without it none of the
// screens built in T11-T13 are reachable in a browser.
//
// Supabase's session/auth-state and the route list are mocked, same pattern
// as the rest of tests/web/. Visual/theme direction is NOT unit-tested here
// (see AGENTS.md for the design brief) — this test only proves the shell
// renders the right screen for the right auth/role state and wires
// navigation, not that it looks a particular way.

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
vi.mock("../../apps/web/src/lib/supabase.js", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}));

const mockFetchRoutes = vi.fn();
// Every export the mounted screens call must exist on the mock: vitest throws when a missing
// export is accessed, and that error lands on whichever test happens to be running (flaky
// "renders the four owner tabs"). Unused-by-this-file calls resolve to empty data.
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchRoutes: mockFetchRoutes,
  fetchDogs: vi.fn().mockResolvedValue([]),
  fetchWalkerProfiles: vi.fn().mockResolvedValue([]),
  fetchWalkerProfile: vi.fn().mockResolvedValue(null),
  fetchRequests: vi.fn().mockResolvedValue([]),
  fetchRequest: vi.fn().mockResolvedValue(null),
  fetchClients: vi.fn().mockResolvedValue([]),
  suggestPlan: vi.fn().mockResolvedValue({ date: "", stops: [], totalDistanceKm: 0 }),
  createRoute: vi.fn().mockResolvedValue({ id: "route-9", stops: [] }),
}));

async function importApp() {
  return import("../../apps/web/src/App.js");
}

function ownerSession() {
  return {
    session: {
      access_token: "t",
      user: { id: "owner-1", user_metadata: { role: "owner" } },
    },
  };
}

function walkerSession() {
  return {
    session: {
      access_token: "t",
      user: { id: "walker-1", user_metadata: { role: "walker" } },
    },
  };
}

describe("App shell", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockFetchRoutes.mockReset();
    mockOnAuthStateChange.mockReset();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("shows the signup screen when logged out", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { App } = await importApp();
    render(<App />);

    expect(await screen.findByRole("heading", { name: /sign up/i })).toBeInTheDocument();
  });

  it("shows the owner dashboard for a logged-in owner", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    render(<App />);

    expect(await screen.findByRole("button", { name: /add dog/i })).toBeInTheDocument();
  });

  it("shows the walker's route list for a logged-in walker", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([
      { id: "route-1", stops: [{ dogId: "dog-1", dogName: "Firulais" }] },
      { id: "route-2", stops: [{ dogId: "dog-2", dogName: "Rex" }] },
    ]);

    const { App } = await importApp();
    render(<App />);

    // S2 polish item 3: route cards are titled with the first dog (plus the
    // formatted time when the stop carries one), never the route UUID.
    expect(await screen.findByText("Firulais")).toBeInTheDocument();
    expect(screen.getByText("Rex")).toBeInTheDocument();
  });

  it("opens a walker route from the list", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([
      { id: "route-1", stops: [{ dogId: "dog-1", dogName: "Firulais" }] },
    ]);

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    const routeLink = await screen.findByText("Firulais");
    await user.click(routeLink);

    await waitFor(() => expect(screen.getByText("Firulais")).toBeInTheDocument());
  });
});

// S0 (UI kit) shell integration. App must render the role-based BottomNav as a
// "Main" navigation with the exact tabs per role (DESIGN.md "Screens per role"),
// mark the active tab with aria-current, show a "Coming soon" EmptyState for
// tabs whose feature does not exist yet, keep the existing screens reachable
// from their tab (walker "Today" -> route list, owner "My dogs" ->
// OwnerDogsScreen), and actually load the kit tokens stylesheet. These cases
// are ADDITIVE — the "App shell" describe above is untouched — and are red
// until s0-impl wires BottomNav + tokens.css into the shell.

describe("App shell — S0 role-based bottom navigation", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockFetchRoutes.mockReset();
    mockOnAuthStateChange.mockReset();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("renders the four walker tabs in the Main navigation", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([]);

    const { App } = await importApp();
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("button").map((tab) => tab.textContent?.trim())).toEqual([
      "Today",
      "Clients",
      "Requests",
      "Profile",
    ]);
  });

  it("renders the four owner tabs in the Main navigation", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("button").map((tab) => tab.textContent?.trim())).toEqual([
      "Discover",
      "My dogs",
      "Activity",
      "Profile",
    ]);
  });

  it("lands the owner on the My dogs tab by default", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Main" });
    // The owner's default tab is My dogs (the existing owner dashboard test
    // expects the dogs screen on first render); Discover must not be current.
    expect(within(nav).getByRole("button", { name: "My dogs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("button", { name: "Discover" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the walker's route list on the Today tab", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([
      { id: "route-1", stops: [{ dogId: "dog-1", dogName: "Firulais" }] },
    ]);

    const { App } = await importApp();
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await screen.findByText("Firulais")).toBeInTheDocument();
  });

  it("keeps the owner's dogs screen on the My dogs tab", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Main" });
    await user.click(within(nav).getByRole("button", { name: "My dogs" }));
    expect(within(nav).getByRole("button", { name: "My dogs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await screen.findByRole("button", { name: /add dog/i })).toBeInTheDocument();
  });

  it("shows the clients screen on the Clients tab (S2)", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([]);

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    // S2 builds the Clients tab, so the walker has no Coming soon tabs left;
    // the owner's Activity it below keeps covering the Coming soon pattern.
    const nav = await screen.findByRole("navigation", { name: "Main" });
    await user.click(within(nav).getByRole("button", { name: "Clients" }));
    expect(within(nav).getByRole("button", { name: "Clients" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await screen.findByRole("heading", { name: "My clients" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Coming soon" })).not.toBeInTheDocument();
  });

  it("shows a Coming soon empty state for an owner tab with no feature yet", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    // S1 builds the Discover tab (browse walkers + send requests); Activity
    // (timeline + checkouts, S2/S3) stays a Coming soon empty state.
    const nav = await screen.findByRole("navigation", { name: "Main" });
    await user.click(within(nav).getByRole("button", { name: "Activity" }));
    expect(await screen.findByRole("heading", { name: "Coming soon" })).toBeInTheDocument();
  });

  it("shows the walker inbox on the Requests tab (S1)", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([]);

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Main" });
    await user.click(within(nav).getByRole("button", { name: "Requests" }));
    expect(within(nav).getByRole("button", { name: "Requests" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Coming soon" })).not.toBeInTheDocument();
  });

  it("shows the walker profile form on the Profile tab (S1)", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([]);

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Main" });
    await user.click(within(nav).getByRole("button", { name: "Profile" }));
    expect(await screen.findByLabelText("Display name")).toBeInTheDocument();
  });

  it("shows walker discovery on the owner's Discover tab (S1)", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Main" });
    await user.click(within(nav).getByRole("button", { name: "Discover" }));
    expect(await screen.findByRole("heading", { name: "Find a walker" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "My requests" })).toBeInTheDocument();
  });

  it("shows the pickup-plan panel on the walker's Today tab (S2)", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([]);

    const { App } = await importApp();
    render(<App />);

    expect(
      await screen.findByRole("button", { name: "Suggest order" }),
    ).toBeInTheDocument();
  });

  it("titles route cards with the first dog and the formatted time, not the UUID (S2)", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([
      {
        id: "route-1",
        stops: [
          { dogId: "dog-1", dogName: "Firulais", pickupTime: "2026-10-05T10:00:00.000Z" },
          { dogId: "dog-2", dogName: "Rex", pickupTime: "2026-10-05T11:00:00.000Z" },
        ],
      },
    ]);

    const { App } = await importApp();
    render(<App />);

    const formatted = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date("2026-10-05T10:00:00.000Z"));

    expect(await screen.findByText("Firulais")).toBeInTheDocument();
    expect(screen.getByText(`${formatted} · 2 stops`)).toBeInTheDocument();
    expect(screen.queryByText(/route-1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-10-05T/)).not.toBeInTheDocument();
  });

  it("loads the design tokens stylesheet from the app entry", async () => {
    const { readFileSync } = await import("node:fs");
    // One of the entry modules must import the kit tokens so they actually
    // load in the browser; PR 2 could otherwise create the file and never use it.
    const entry = `${readFileSync("apps/web/src/main.tsx", "utf8")}\n${readFileSync(
      "apps/web/src/App.tsx",
      "utf8",
    )}`;
    expect(entry).toMatch(/import\s+["']\.\/ui\/tokens\.css["']/);
  });
});
