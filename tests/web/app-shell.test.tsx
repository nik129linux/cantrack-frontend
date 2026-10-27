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

const mockSetAccountRole = vi.fn().mockResolvedValue({ role: "owner" });
const mockLogoutAccount = vi.fn().mockResolvedValue(undefined);
vi.mock("../../apps/web/src/lib/marketplace.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/web/src/lib/marketplace.js")>()),
  logoutAccount: mockLogoutAccount,
  setAccountRole: mockSetAccountRole,
  recordOwnerConsent: vi.fn().mockResolvedValue(null),
  recordWalkerConsent: vi.fn().mockResolvedValue(null),
  // Inicio and Explorar of the owner read the marketplace API.
  fetchOwnerHome: vi.fn().mockResolvedValue({
    greetingName: "Camila",
    activeWalk: null,
    nextWalk: null,
    upcoming: [],
    openRequests: [],
    counts: { dogs: 0, walksDone: 0, openRequests: 0 },
  }),
  fetchWeather: vi.fn().mockRejectedValue(new Error("no weather in tests")),
  fetchOwnerRequests: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  fetchFareSuggestion: vi.fn().mockResolvedValue({ suggestedCop: 15000, basis: "default", sampleSize: 0, minCop: 8000, stepCop: 1000 }),
  fetchNearbyWalkers: vi.fn().mockResolvedValue({ count: 0, radiusKm: 2 }),
  // Walker screens.
  fetchWalkerHome: vi.fn().mockResolvedValue({
    greetingName: "Mateo", online: false, activeWalk: null, nextWalk: null,
    today: { walks: 0, grossCop: 0, commissionCop: 0, netCop: 0 },
    rating: { average: null, count: 0 }, openNearby: 0, pendingOffers: 0,
  }),
  fetchEarnings: vi.fn().mockResolvedValue({
    period: "week", from: "2026-10-19", to: "2026-10-25", simulated: true, commissionPct: 10,
    walks: 0, grossCop: 0, commissionCop: 0, netCop: 0, byDay: [],
  }),
  fetchOpenRequests: vi.fn().mockResolvedValue([]),
  fetchMyOffers: vi.fn().mockResolvedValue([]),
  fetchClientList: vi.fn().mockResolvedValue([]),
  fetchDayRoute: vi.fn().mockResolvedValue({ date: "2026-10-27", start: null, stops: [], totalKm: 0, totalMinutes: 0, nextStopId: null }),
  fetchWalkerAccountProfile: vi.fn().mockResolvedValue({
    walkerId: "walker-1", email: "mateo@gmail.com", displayName: "Mateo", bio: null, serviceArea: null,
    pricePerWalk: 15000, phone: null, avatarUrl: null, consent: null,
    stats: { walksDone: 0, rating: { average: null, count: 0 } },
  }),
  fetchWalkerWalks: vi.fn().mockResolvedValue([]),
  fetchOwnerProfile: vi.fn().mockResolvedValue({
    ownerId: "owner-1",
    email: "camila@gmail.com",
    displayName: "Camila",
    phone: null,
    avatarUrl: null,
    home: null,
    consent: null,
    stats: { dogs: 0, walksDone: 0 },
  }),
  fetchOwnerWalks: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
}));

async function importApp() {
  return import("../../apps/web/src/App.js");
}

function ownerSession() {
  return {
    session: {
      access_token: "t",
      user: { id: "owner-1", app_metadata: { role: "owner" } },
    },
  };
}

function walkerSession() {
  return {
    session: {
      access_token: "t",
      user: { id: "walker-1", app_metadata: { role: "walker" } },
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

    expect(await screen.findByRole("heading", { name: "Hola, Camila", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add dog/i })).not.toBeInTheDocument();
  });

  it("lands a logged-in walker on the home panel", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    mockFetchRoutes.mockResolvedValue([]);

    const { App } = await importApp();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Hola, Mateo", level: 1 })).toBeInTheDocument();
  });

  it("shows the owner's dogs screen from the Mis perros tab", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Mis perros");
    expect(await screen.findByRole("button", { name: /add dog/i })).toBeInTheDocument();
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
    await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(mockLogoutAccount).toHaveBeenCalledWith(undefined);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("asks the API for the role of an old account that only had it in user_metadata", async () => {
    mockSetAccountRole.mockClear();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "t", user: { id: "u-1", app_metadata: {}, user_metadata: { role: "walker" } } } },
    });

    const { App } = await importApp();
    render(<App />);

    await vi.waitFor(() => expect(mockSetAccountRole).toHaveBeenCalledWith("walker"));
  });

  it("explains an account without a walker or owner role", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "t", user: { id: "u-1", app_metadata: {} } } },
    });

    const { App } = await importApp();
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu cuenta aún no tiene un rol de dueño o paseador.",
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
    expect(await screen.findByRole("heading", { name: "Hola, Camila", level: 1 })).toBeInTheDocument();
  });

  it("shows the owner profile on the Perfil tab", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Perfil");
    expect(await screen.findByRole("heading", { name: "Perfil", level: 1 })).toBeInTheDocument();
  });

  it("shows Mis paseos on the owner's Paseos tab", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Paseos");
    expect(await screen.findByRole("heading", { name: "Mis paseos" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Coming soon" })).not.toBeInTheDocument();
  });

  it("shows the walker's inbox on the Solicitudes tab", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Solicitudes");
    expect(await screen.findByRole("heading", { name: "Solicitudes", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/No hay solicitudes cerca/)).toBeInTheDocument();
  });

  it("shows the clients screen on the walker's Clientes tab", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Clientes");
    expect(await screen.findByRole("heading", { name: "Clientes", level: 1 })).toBeInTheDocument();
  });

  it("shows the day route on the walker's Rutas tab", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Rutas");
    expect(await screen.findByRole("heading", { name: "Rutas", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/No tienes paseos este día/)).toBeInTheDocument();
  });

  it("shows the walker profile on the Perfil tab", async () => {
    mockGetSession.mockResolvedValue({ data: walkerSession() });
    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Perfil");
    expect(await screen.findByLabelText("Nombre")).toHaveValue("Mateo");
  });

  it("shows walker discovery on the owner's Explorar tab (S1)", async () => {
    mockGetSession.mockResolvedValue({ data: ownerSession() });

    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    await openTab(user, "Explorar");
    expect(await screen.findByRole("heading", { name: "Explorar", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Mis solicitudes" })).toBeInTheDocument();
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
