// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The app shell: routes between the auth screens (logged out) and the glass
// home (logged in). The home lands on the "Inicio" panel; the "Principal"
// navigation opens every real screen of the role (owner: Explorar, Mis perros,
// Paseos, Perfil; walker: Solicitudes, Clientes, Rutas, Perfil).
//
// Supabase's session/auth-state and the API calls are mocked, same pattern as
// the rest of tests/web/. Visual direction is NOT unit-tested here — this only
// proves the shell renders the right screen for the right auth/role state and
// wires navigation.

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
vi.mock("../../apps/web/src/lib/supabase.js", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

const mockFetchRoutes = vi.fn();
// Every export the mounted screens call must exist on the mock: vitest throws when a missing
// export is accessed, and that error lands on whichever test happens to be running.
// Unused-by-this-file calls resolve to empty data.
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
  fetchRequestCheckout: vi.fn().mockResolvedValue(null),
  createCheckout: vi.fn().mockResolvedValue(null),
  updateCheckoutNote: vi.fn().mockResolvedValue(null),
  sendCheckout: vi.fn().mockResolvedValue(null),
  rerunAiNote: vi.fn().mockResolvedValue(null),
  fetchAiQuota: vi.fn().mockResolvedValue({ used: 0, limit: 60, resetsAt: "" }),
  fetchCheckouts: vi.fn().mockResolvedValue([]),
  fetchTimeline: vi.fn().mockResolvedValue([]),
  createOpenOffer: vi.fn().mockResolvedValue(null),
  raiseOfferPrice: vi.fn().mockResolvedValue(null),
  fetchOpenOffers: vi.fn().mockResolvedValue([]),
  acceptOpenOffer: vi.fn().mockResolvedValue(null),
  declineOpenOffer: vi.fn().mockResolvedValue(null),
  cancelRequest: vi.fn().mockResolvedValue(null),
  createRequest: vi.fn().mockResolvedValue(null),
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

function resetMocks() {
  cleanup(); // earlier tests leave their screens mounted (no auto-cleanup)
  mockGetSession.mockReset();
  mockFetchRoutes.mockReset();
  mockOnAuthStateChange.mockReset();
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
}

async function openTab(user: ReturnType<typeof userEvent.setup>, name: string) {
  const nav = await screen.findByRole("navigation", { name: "Principal" });
  await user.click(within(nav).getByRole("button", { name }));
  return nav;
}

describe("App shell", () => {
  beforeEach(resetMocks);

  it("shows the role screen first when logged out", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { App } = await importApp();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "¿Cómo quieres usar CanTrack?" })).toBeInTheDocument();
  });

  it("lands a logged-in owner on the home panel", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Hola, dueño", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add dog/i })).not.toBeInTheDocument();
  });

  it("lands a logged-in walker on the home panel", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([]);

    const { App } = await importApp();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Hola, cuidador", level: 1 })).toBeInTheDocument();
  });

  it("shows the owner's dogs screen from the Mis perros tab", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Mis perros");
    expect(await screen.findByRole("button", { name: /add dog/i })).toBeInTheDocument();
  });

  it("shows the walker's route list on the Rutas tab", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([
      { id: "route-1", stops: [{ dogId: "dog-1", dogName: "Firulais" }] },
      { id: "route-2", stops: [{ dogId: "dog-2", dogName: "Rex" }] },
    ]);

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Rutas");
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

    await openTab(user, "Rutas");
    await user.click(await screen.findByText("Firulais"));

    expect(await screen.findByRole("button", { name: /all routes/i })).toBeInTheDocument();
  });

  it("logs out through the Salir button", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });
    const { supabase } = await import("../../apps/web/src/lib/supabase.js");
    const signOut = supabase.auth.signOut as unknown as ReturnType<typeof vi.fn>;
    signOut.mockClear();

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Salir" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("explains an account without a walker or owner role", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "t", user: { id: "u-1", user_metadata: {} } } },
    });

    const { App } = await importApp();
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This account does not have a walker or owner role.",
    );
    expect(screen.queryByRole("navigation", { name: "Principal" })).not.toBeInTheDocument();
  });
});

// The glass navigation ("Principal") wraps the real screens: exact tabs per
// role, the current tab carries aria-current, and every existing screen stays
// reachable from its tab.

describe("App shell — glass navigation", () => {
  beforeEach(resetMocks);

  it("renders the five walker tabs", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([]);

    const { App } = await importApp();
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Principal" });
    expect(within(nav).getAllByRole("button").map((tab) => tab.textContent?.trim())).toEqual([
      "Inicio",
      "Solicitudes",
      "Clientes",
      "Rutas",
      "Perfil",
    ]);
  });

  it("renders the five owner tabs", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Principal" });
    expect(within(nav).getAllByRole("button").map((tab) => tab.textContent?.trim())).toEqual([
      "Inicio",
      "Explorar",
      "Mis perros",
      "Paseos",
      "Perfil",
    ]);
  });

  it("starts on Inicio and moves the current marker when another tab opens", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("button", { name: "Inicio" })).toHaveAttribute("aria-current", "page");

    await user.click(within(nav).getByRole("button", { name: "Mis perros" }));
    expect(within(nav).getByRole("button", { name: "Mis perros" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("returns to the home panel from Inicio", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Mis perros");
    await openTab(user, "Inicio");
    expect(await screen.findByRole("heading", { name: "Hola, dueño", level: 1 })).toBeInTheDocument();
  });

  it("shows the clients screen on the walker's Clientes tab (S2)", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([]);

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Clientes");
    expect(await screen.findByRole("heading", { name: "My clients" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Coming soon" })).not.toBeInTheDocument();
  });

  it("shows a Coming soon empty state on the owner's Perfil tab", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Perfil");
    expect(await screen.findByRole("heading", { name: "Coming soon" })).toBeInTheDocument();
  });

  it("shows the activity screen on the owner's Paseos tab (S3)", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Paseos");
    expect(await screen.findByRole("heading", { name: "Activity" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Coming soon" })).not.toBeInTheDocument();
  });

  it("shows the walker inbox on the Solicitudes tab (S1)", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([]);

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Solicitudes");
    expect(await screen.findByRole("heading", { name: "Ofertas de paseo" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Coming soon" })).not.toBeInTheDocument();
  });

  it("shows the walker profile form on the Perfil tab (S1)", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([]);

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Perfil");
    expect(await screen.findByLabelText("Display name")).toBeInTheDocument();
  });

  it("shows walker discovery on the owner's Explorar tab (S1)", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Explorar");
    expect(await screen.findByRole("heading", { name: "Explorar", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Mis ofertas" })).toBeInTheDocument();
  });

  it("shows the pickup-plan panel on the walker's Rutas tab (S2)", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([]);

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Rutas");
    expect(await screen.findByRole("button", { name: "Suggest order" })).toBeInTheDocument();
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
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Rutas");
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
    // load in the browser.
    const entry = `${readFileSync("apps/web/src/main.tsx", "utf8")}\n${readFileSync(
      "apps/web/src/App.tsx",
      "utf8",
    )}`;
    expect(entry).toMatch(/import\s+["']\.\/ui\/tokens\.css["']/);
  });
});
