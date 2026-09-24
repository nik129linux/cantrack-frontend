// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchRoutes: mockFetchRoutes,
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

    expect(await screen.findByText(/route-1/i)).toBeInTheDocument();
    expect(screen.getByText(/route-2/i)).toBeInTheDocument();
  });

  it("opens a walker route from the list", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([
      { id: "route-1", stops: [{ dogId: "dog-1", dogName: "Firulais" }] },
    ]);

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    const routeLink = await screen.findByText(/route-1/i);
    await user.click(routeLink);

    await waitFor(() => expect(screen.getByText("Firulais")).toBeInTheDocument());
  });
});
