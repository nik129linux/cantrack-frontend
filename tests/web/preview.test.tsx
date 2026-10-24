// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Development-only preview: `?preview=owner|walker` enters the app with a fake
// session (no Supabase account needed). Anything else leaves the normal flow
// untouched, and the real session is never consulted while previewing.

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
}));

async function importApp() {
  return import("../../apps/web/src/App.js");
}

describe("Development preview (?preview=...)", () => {
  beforeEach(() => {
    cleanup();
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockReset();
    mockFetchRoutes.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("enters as an owner without asking Supabase for a session", async () => {
    window.history.pushState({}, "", "/?preview=owner");
    const { App } = await importApp();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Hola, dueño", level: 1 })).toBeInTheDocument();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockOnAuthStateChange).not.toHaveBeenCalled();
  });

  it("enters as a walker and loads the route list", async () => {
    window.history.pushState({}, "", "/?preview=walker");
    mockFetchRoutes.mockResolvedValue([
      { id: "route-1", stops: [{ dogId: "dog-1", dogName: "Firulais" }] },
    ]);
    const { App } = await importApp();
    const user = userEvent.setup();
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Principal" });
    await user.click(within(nav).getByRole("button", { name: "Rutas" }));

    expect(await screen.findByText("Firulais")).toBeInTheDocument();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("ignores an unknown preview role and shows the role screen", async () => {
    window.history.pushState({}, "", "/?preview=admin");
    const { App } = await importApp();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "¿Cómo quieres usar CanTrack?" })).toBeInTheDocument();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("does nothing without the preview parameter", async () => {
    const { App } = await importApp();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "¿Cómo quieres usar CanTrack?" })).toBeInTheDocument();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });
});
