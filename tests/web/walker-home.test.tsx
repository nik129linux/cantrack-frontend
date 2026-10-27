// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Walker Inicio, docs/frontend/walker-inicio.md: the online switch (the stored
// position IS the switch), one /home call, the 30 s heartbeat and Ganancias.

vi.mock("../../apps/web/src/lib/supabase.js", () => ({ supabase: { auth: {} } }));
vi.mock("../../apps/web/src/city/CityScene.js", () => ({ CityScene: () => <div data-testid="city" /> }));

const mockHome = vi.fn();
const mockEarnings = vi.fn();
const mockAvailability = vi.fn();
const mockHeartbeat = vi.fn();
vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchWalkerHome: mockHome,
  fetchEarnings: mockEarnings,
  setAvailability: mockAvailability,
  sendHeartbeat: mockHeartbeat,
}));

function home(over: Record<string, unknown> = {}) {
  return {
    greetingName: "Mateo",
    online: false,
    activeWalk: null,
    nextWalk: {
      id: "w1", dogName: "Luna", ownerName: null,
      requestedTime: "2026-10-25T22:00:00+00:00", durationHours: 0.75, priceCop: 17000,
    },
    today: { walks: 2, grossCop: 35000, commissionCop: 3500, netCop: 31500 },
    rating: { average: 4.67, count: 12 },
    openNearby: 3,
    pendingOffers: 1,
    ...over,
  };
}

const earnings = {
  period: "week", from: "2026-10-19", to: "2026-10-25", simulated: true, commissionPct: 10,
  walks: 6, grossCop: 102000, commissionCop: 10200, netCop: 91800,
  byDay: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${19 + i}`, walks: 1, grossCop: 1000, netCop: 900 })),
};

function mockGeolocation(result: "ok" | "denied") {
  const getCurrentPosition = vi.fn((success: (p: unknown) => void, failure: () => void) => {
    if (result === "ok") success({ coords: { latitude: 1.214, longitude: -77.2811 } });
    else failure();
  });
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
  return getCurrentPosition;
}

async function renderHome() {
  const { HomeShell } = await import("../../apps/web/src/home/HomeDashboard.js");
  const user = userEvent.setup();
  render(<HomeShell role="walker" userId="walker-1" />);
  return user;
}

describe("Walker Inicio", () => {
  beforeEach(() => {
    cleanup();
    for (const mock of [mockHome, mockEarnings, mockAvailability, mockHeartbeat]) mock.mockReset();
    mockHome.mockResolvedValue(home());
    mockEarnings.mockResolvedValue(earnings);
    mockGeolocation("ok");
  });
  afterEach(() => vi.useRealTimers());

  it("greets by name and draws the ticket, today's net and the rating", async () => {
    await renderHome();

    expect(await screen.findByRole("heading", { name: "Hola, Mateo", level: 1 })).toBeInTheDocument();
    const ticket = screen.getByRole("region", { name: "Próximo recorrido" });
    expect(within(ticket).getByText(/Dueño/)).toBeInTheDocument();
    expect(within(ticket).getByText("$17.000")).toBeInTheDocument();
    expect(screen.getByText("Hoy: 2 paseos · $31.500 netos")).toBeInTheDocument();
    expect(screen.getByText("Comisión simulada 10%: $3.500")).toBeInTheDocument();
    expect(screen.getByText("★ 4.7 (12)")).toBeInTheDocument();
    expect(mockHome).toHaveBeenCalledWith("walker-1");
  });

  it("is offline by default and asks to connect, hiding the nearby requests", async () => {
    await renderHome();
    await screen.findByRole("heading", { name: "Hola, Mateo" });

    expect(screen.getByRole("switch", { name: "Desconectado" })).not.toBeChecked();
    expect(screen.queryByText(/solicitudes cerca/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Conéctate para recibir solicitudes").length).toBeGreaterThan(0);
  });

  it("goes online by sending the current position", async () => {
    mockAvailability.mockResolvedValue({ online: true, updatedAt: "x" });
    mockHome.mockResolvedValueOnce(home()).mockResolvedValue(home({ online: true }));
    const user = await renderHome();

    await user.click(await screen.findByRole("switch", { name: "Desconectado" }));
    await waitFor(() => expect(mockAvailability).toHaveBeenCalledWith("walker-1", true, { lat: 1.214, lng: -77.2811 }));
    expect(await screen.findByRole("switch", { name: "Conectado" })).toBeChecked();
    expect(await screen.findByText("3 solicitudes cerca")).toBeInTheDocument();
  });

  it("goes offline without sending any position", async () => {
    mockHome.mockResolvedValue(home({ online: true }));
    mockAvailability.mockResolvedValue({ online: false, updatedAt: null });
    const user = await renderHome();

    await user.click(await screen.findByRole("switch", { name: "Conectado" }));
    await waitFor(() => expect(mockAvailability).toHaveBeenCalledWith("walker-1", false));
  });

  it("does not connect without a location", async () => {
    mockGeolocation("denied");
    const user = await renderHome();

    await user.click(await screen.findByRole("switch", { name: "Desconectado" }));
    expect(await screen.findByText("Activa la ubicación del navegador para conectarte.")).toBeInTheDocument();
    expect(mockAvailability).not.toHaveBeenCalled();
  });

  it("asks to wait on a 429 from the switch", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockAvailability.mockRejectedValue(new ApiError("slow down", 429));
    const user = await renderHome();

    await user.click(await screen.findByRole("switch", { name: "Desconectado" }));
    expect(await screen.findByText("Espera un momento")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("keeps the heartbeat every 30 s only while online", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockHome.mockResolvedValue(home({ online: true }));
    mockHeartbeat.mockResolvedValue({});
    await renderHome();
    await screen.findByRole("switch", { name: "Conectado" });

    await vi.advanceTimersByTimeAsync(30_100);
    expect(mockHeartbeat).toHaveBeenCalledWith(1.214, -77.2811);
  });

  it("shows the live card while a walk is in progress", async () => {
    mockHome.mockResolvedValue(
      home({ online: true, activeWalk: { id: "w9", dogName: "Max", ownerName: "Camila", requestedTime: "2026-10-25T22:00:00+00:00", durationHours: 1, priceCop: 20000 } }),
    );
    await renderHome();

    const live = await screen.findByRole("region", { name: "Paseo en curso" });
    expect(within(live).getByText("Paseando a Max")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Próximo recorrido" })).not.toBeInTheDocument();
  });

  it("draws Ganancias with the simulated commission and one bar per day", async () => {
    await renderHome();

    const card = await screen.findByRole("region", { name: "Ganancias" });
    expect(await within(card).findByText("6 paseos · $91.800 netos")).toBeInTheDocument();
    expect(within(card).getByText("Comisión simulada 10%: $10.200")).toBeInTheDocument();
    expect(within(card).getByRole("list", { name: "Ganancias por día" }).children).toHaveLength(7);

    const user = userEvent.setup();
    await user.click(within(card).getByRole("button", { name: "Mes" }));
    await waitFor(() => expect(mockEarnings).toHaveBeenLastCalledWith("walker-1", "month"));
  });

  it("says there are no walks today and no ratings yet", async () => {
    mockHome.mockResolvedValue(home({ today: { walks: 0, grossCop: 0, commissionCop: 0, netCop: 0 }, rating: { average: null, count: 0 } }));
    await renderHome();

    expect(await screen.findByText("Aún no hay paseos hoy")).toBeInTheDocument();
    expect(screen.getByText("Sin calificaciones aún")).toBeInTheDocument();
  });
});
