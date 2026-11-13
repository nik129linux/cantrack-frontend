// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Walker Inicio, docs/frontend/walker-inicio.md: the online switch (the stored
// position IS the switch), one /home call, the 30 s heartbeat and Ganancias.

vi.mock("../../apps/web/src/lib/supabase.js", () => ({ supabase: { auth: {} } }));
vi.mock("../../apps/web/src/city/CityScene.js", () => ({ CityScene: () => <div data-testid="city" /> }));

const mockHome = vi.fn();
const mockEarnings = vi.fn();
const mockAvailability = vi.fn();
const mockHeartbeat = vi.fn();
const mockGoal = vi.fn();
vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchWalkerHome: mockHome,
  fetchEarnings: mockEarnings,
  setAvailability: mockAvailability,
  sendHeartbeat: mockHeartbeat,
  setWalkerGoal: mockGoal,
  fetchWeather: vi.fn().mockRejectedValue(new Error("no weather")),
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
    nearby: [
      { id: "o1", dogName: "Toby", requestedTime: "2026-10-25T20:00:00+00:00", durationHours: 0.5, priceCop: 14000, distanceKm: 0.4, offered: false },
      { id: "o2", dogName: "Kira", requestedTime: "2026-10-25T23:00:00+00:00", durationHours: 1, priceCop: 22000, distanceKm: 1.2, offered: true },
    ],
    pendingOffers: 1,
    ...over,
  };
}

const earnings = {
  period: "week", from: "2026-10-19", to: "2026-10-25", simulated: true, commissionPct: 10,
  walks: 6, grossCop: 102000, commissionCop: 10200, netCop: 91800,
  byDay: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${19 + i}`, walks: 1, grossCop: 1000, netCop: 900 })),
  previous: { walks: 5, netCop: 80000 },
  bestDay: { date: "2026-10-23", netCop: 900 },
  avgPerWalkCop: 15300,
  goalCop: 100000,
  dayWalks: null,
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

const theSwitch = () => screen.findByRole("switch", { name: "En línea" });

describe("Walker Inicio", () => {
  beforeEach(() => {
    cleanup();
    for (const mock of [mockHome, mockEarnings, mockAvailability, mockHeartbeat, mockGoal]) mock.mockReset();
    mockHome.mockResolvedValue(home());
    mockEarnings.mockResolvedValue(earnings);
    mockGeolocation("ok");
  });
  afterEach(() => vi.useRealTimers());

  it("greets by name and draws the ticket, today's net and the rating", async () => {
    await renderHome();

    expect(await screen.findByRole("heading", { name: "Hola, Mateo", level: 1 })).toBeInTheDocument();
    const ticket = screen.getByRole("region", { name: "Próximo paseo" });
    expect(within(ticket).getByText(/Dueño/)).toBeInTheDocument();
    expect(within(ticket).getByText("$17.000")).toBeInTheDocument();
    const today = screen.getByRole("region", { name: "Hoy" });
    expect(within(today).getByText("2")).toBeInTheDocument();
    expect(within(today).getByText("$31.500")).toBeInTheDocument();
    expect(within(today).getByText("Comisión simulada 10%: $3.500")).toBeInTheDocument();
    expect(within(today).getByText("4,7")).toBeInTheDocument();
    expect(within(today).getByText("12 calificaciones")).toBeInTheDocument();
    expect(mockHome).toHaveBeenCalledWith("walker-1");
  });

  it("is offline by default and asks to connect, hiding the nearby requests", async () => {
    await renderHome();
    await screen.findByRole("heading", { name: "Hola, Mateo" });

    expect(await theSwitch()).not.toBeChecked();
    expect(screen.getByRole("switch")).toHaveTextContent("Conectarme");
    expect(screen.getByText("Estás desconectado")).toBeInTheDocument();
    const nearby = screen.getByRole("region", { name: "Solicitudes cerca" });
    expect(within(nearby).getByText("Conéctate para ver solicitudes cerca de ti.")).toBeInTheDocument();
    expect(within(nearby).queryByText("Toby")).not.toBeInTheDocument();
  });

  it("goes online by sending the current position", async () => {
    mockAvailability.mockResolvedValue({ online: true, updatedAt: "x" });
    mockHome.mockResolvedValueOnce(home()).mockResolvedValue(home({ online: true }));
    const user = await renderHome();

    await user.click(await theSwitch());
    await waitFor(() => expect(mockAvailability).toHaveBeenCalledWith("walker-1", true, { lat: 1.214, lng: -77.2811 }));
    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
    expect(screen.getByRole("switch")).toHaveTextContent("Desconectarme");
    expect(await screen.findByText("3 solicitudes cerca de ti")).toBeInTheDocument();
  });

  it("goes offline without sending any position", async () => {
    mockHome.mockResolvedValue(home({ online: true }));
    mockAvailability.mockResolvedValue({ online: false, updatedAt: null });
    const user = await renderHome();

    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
    await user.click(await theSwitch());
    await waitFor(() => expect(mockAvailability).toHaveBeenCalledWith("walker-1", false));
  });

  it("does not connect without a location", async () => {
    mockGeolocation("denied");
    const user = await renderHome();

    await user.click(await theSwitch());
    expect(await screen.findByText("Activa la ubicación del navegador para conectarte.")).toBeInTheDocument();
    expect(mockAvailability).not.toHaveBeenCalled();
  });

  it("asks to wait on a 429 from the switch", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockAvailability.mockRejectedValue(new ApiError("slow down", 429));
    const user = await renderHome();

    await user.click(await theSwitch());
    expect(await screen.findByText("Espera un momento")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("keeps the heartbeat every 30 s only while online", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockHome.mockResolvedValue(home({ online: true }));
    mockHeartbeat.mockResolvedValue({});
    await renderHome();
    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
    // Let React commit the shared presence before the 30 s clock starts.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_100);
    });
    expect(mockHeartbeat).toHaveBeenCalledWith(1.214, -77.2811);
  });

  it("keeps the heartbeat going after leaving Inicio for another tab", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockHome.mockResolvedValue(home({ online: true }));
    mockHeartbeat.mockResolvedValue({});
    const { HomeShell } = await import("../../apps/web/src/home/HomeDashboard.js");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<HomeShell role="walker" userId="walker-1" screens={{ requests: <p>Pantalla de solicitudes</p> }} />);
    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());

    await user.click(screen.getByRole("button", { name: "Solicitudes" }));
    expect(await screen.findByText("Pantalla de solicitudes")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_100);
    });
    expect(mockHeartbeat).toHaveBeenCalledWith(1.214, -77.2811);
  });

  it("shows the live card while a walk is in progress", async () => {
    mockHome.mockResolvedValue(
      home({ online: true, activeWalk: { id: "w9", dogName: "Max", ownerName: "Camila", requestedTime: "2026-10-25T22:00:00+00:00", durationHours: 1, priceCop: 20000 } }),
    );
    await renderHome();

    const live = await screen.findByRole("region", { name: "Paseo en curso" });
    expect(within(live).getByText("Paseando a Max")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Próximo paseo" })).not.toBeInTheDocument();
  });

  it("draws Ganancias with the simulated commission and one bar per day", async () => {
    await renderHome();

    const card = await screen.findByRole("region", { name: "Ganancias" });
    expect(await within(card).findByText("6 paseos · $91.800 netos")).toBeInTheDocument();
    expect(await within(card).findByText("$91.800", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(within(card).getByText("Comisión simulada 10%: $10.200")).toBeInTheDocument();
    const bars = within(card).getByRole("group", { name: "Ganancias por día" });
    expect(within(bars).getAllByRole("button")).toHaveLength(7);
    expect(within(card).getByText("▲ 15 % vs. semana pasada")).toBeInTheDocument();
    expect(within(card).getByText("Promedio por paseo: $15.300")).toBeInTheDocument();
    expect(within(card).getByText(/Mejor día: vie.*23/)).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "Meta semanal: 92 %" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(card).getByRole("button", { name: "Mes" }));
    await waitFor(() => expect(mockEarnings).toHaveBeenLastCalledWith("walker-1", "month"));
  });

  it("shows a tip with the day's numbers when a bar gets focus", async () => {
    const user = await renderHome();
    const card = await screen.findByRole("region", { name: "Ganancias" });
    const bars = await within(card).findByRole("group", { name: "Ganancias por día" });

    await user.click(within(bars).getAllByRole("button")[2]!);
    const tip = within(card).getByRole("status");
    expect(tip).toHaveTextContent("1 paseo · $900");
    await user.keyboard("{ArrowRight}");
    expect(within(bars).getAllByRole("button")[3]).toHaveFocus();
  });

  it("says when the week went down", async () => {
    mockEarnings.mockResolvedValue({ ...earnings, previous: { walks: 8, netCop: 102000 } });
    await renderHome();
    expect(await screen.findByText("▼ 10 % vs. semana pasada")).toBeInTheDocument();
  });

  it("sets the weekly goal and saves it on the server", async () => {
    mockEarnings.mockResolvedValue({ ...earnings, goalCop: null });
    mockGoal.mockResolvedValue({ goalCop: 200000 });
    const user = await renderHome();
    const card = await screen.findByRole("region", { name: "Ganancias" });

    await user.click(await within(card).findByRole("button", { name: /Fija tu meta semanal/ }));
    await user.type(within(card).getByLabelText("Meta semanal"), "200000");
    await user.click(within(card).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mockGoal).toHaveBeenCalledWith("walker-1", 200000));
    expect(await within(card).findByRole("img", { name: "Meta semanal: 46 %" })).toBeInTheDocument();
  });

  it("refuses a goal out of range without calling the API", async () => {
    mockEarnings.mockResolvedValue({ ...earnings, goalCop: null });
    const user = await renderHome();
    const card = await screen.findByRole("region", { name: "Ganancias" });

    await user.click(await within(card).findByRole("button", { name: /Fija tu meta semanal/ }));
    await user.type(within(card).getByLabelText("Meta semanal"), "500");
    await user.click(within(card).getByRole("button", { name: "Guardar" }));
    expect(within(card).getByRole("alert")).toHaveTextContent("Entre $10.000 y $5.000.000.");
    expect(mockGoal).not.toHaveBeenCalled();
  });

  it("lists today's walks in the Día view", async () => {
    const user = await renderHome();
    mockEarnings.mockResolvedValue({
      ...earnings, period: "day", walks: 2, netCop: 27000,
      byDay: [{ date: "2026-10-25", walks: 2, grossCop: 30000, netCop: 27000 }],
      dayWalks: [
        { id: "d1", dogName: "Toby", requestedTime: "2026-10-25T13:00:00+00:00", netCop: 12600 },
        { id: "d2", dogName: "Kira", requestedTime: "2026-10-25T21:00:00+00:00", netCop: 14400 },
      ],
    });
    const card = await screen.findByRole("region", { name: "Ganancias" });
    await user.click(within(card).getByRole("button", { name: "Día" }));

    const list = await within(card).findByRole("list", { name: "Paseos de hoy" });
    expect(within(list).getByText("Toby")).toBeInTheDocument();
    expect(within(list).getByText("$14.400")).toBeInTheDocument();
  });

  it("draws the month as one area with a target per day", async () => {
    const user = await renderHome();
    mockEarnings.mockResolvedValue({
      ...earnings, period: "month",
      byDay: Array.from({ length: 30 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, walks: 1, grossCop: 1000, netCop: 900 + i })),
    });
    const card = await screen.findByRole("region", { name: "Ganancias" });
    await user.click(within(card).getByRole("button", { name: "Mes" }));

    await waitFor(() => expect(within(within(card).getByRole("group", { name: "Ganancias por día" })).getAllByRole("button")).toHaveLength(30));
  });

  it("shows a friendly empty state that leads to Solicitudes", async () => {
    mockEarnings.mockResolvedValue({
      ...earnings, walks: 0, grossCop: 0, commissionCop: 0, netCop: 0, previous: { walks: 0, netCop: 0 }, bestDay: null, avgPerWalkCop: 0,
      byDay: earnings.byDay.map((day) => ({ ...day, walks: 0, grossCop: 0, netCop: 0 })),
    });
    const user = await renderHome();
    const card = await screen.findByRole("region", { name: "Ganancias" });

    expect(await within(card).findByText(/Tu primera ganancia aparece aquí/)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Ver solicitudes" }));
    expect(screen.getByRole("button", { name: "Solicitudes" })).toHaveAttribute("aria-current", "page");
  });

  it("says there are no walks today and no ratings yet", async () => {
    mockHome.mockResolvedValue(home({ today: { walks: 0, grossCop: 0, commissionCop: 0, netCop: 0 }, rating: { average: null, count: 0 } }));
    await renderHome();

    expect(await screen.findByText("Aún no hay paseos hoy.")).toBeInTheDocument();
    expect(screen.getByText("Nuevo")).toBeInTheDocument();
    expect(screen.getByText("sin calificaciones")).toBeInTheDocument();
  });

  it("flags a walk whose slot already passed and sends it to Rutas", async () => {
    mockHome.mockResolvedValue(
      home({ nextWalk: { id: "w1", dogName: "Luna", ownerName: "Camila", requestedTime: "2026-10-25T22:00:00+00:00", durationHours: 0.75, priceCop: 17000, stale: true } }),
    );
    const user = await renderHome();

    const ticket = await screen.findByRole("region", { name: "Pendiente de iniciar" });
    expect(within(ticket).getByText(/^Era para el/)).toBeInTheDocument();
    await user.click(within(ticket).getByRole("button", { name: "Ver en Rutas" }));
    expect(screen.getByRole("button", { name: "Rutas" })).toHaveAttribute("aria-current", "page");
  });

  it("previews the nearby requests while online and opens Solicitudes", async () => {
    mockHome.mockResolvedValue(home({ online: true }));
    const user = await renderHome();

    const nearby = await screen.findByRole("region", { name: "Solicitudes cerca" });
    expect(within(nearby).getByText("Toby")).toBeInTheDocument();
    expect(within(nearby).getByText("$14.000")).toBeInTheDocument();
    expect(within(nearby).getByText("a 0,4 km")).toBeInTheDocument();
    expect(within(nearby).getByText("Ya ofertaste")).toBeInTheDocument();
    await user.click(within(nearby).getByRole("button", { name: "Ver todas (3)" }));
    expect(screen.getByRole("button", { name: "Solicitudes" })).toHaveAttribute("aria-current", "page");
  });

  it("invites to offer when there are no walks on the agenda", async () => {
    mockHome.mockResolvedValue(home({ nextWalk: null }));
    await renderHome();

    expect(await screen.findByText(/Aún no tienes paseos agendados/)).toBeInTheDocument();
  });
});
