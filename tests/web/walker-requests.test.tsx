// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Solicitudes (walker), docs/frontend/walker-solicitudes.md: accept in one tap,
// counter in steps of $1.000 (max 2x the fare), withdraw, "Mis ofertas" chips.

const mockOpen = vi.fn();
const mockSend = vi.fn();
const mockWithdraw = vi.fn();
const mockMine = vi.fn();
const mockAvailability = vi.fn();
const mockSetAvailability = vi.fn();

vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchOpenRequests: mockOpen,
  sendOffer: mockSend,
  withdrawOffer: mockWithdraw,
  fetchMyOffers: mockMine,
  fetchAvailability: mockAvailability,
  setAvailability: mockSetAvailability,
  sendHeartbeat: vi.fn().mockResolvedValue({}),
  etaMinutes: (km: number) => Math.round((km / 4.5) * 60),
}));
vi.mock("../../apps/web/src/map/MarkersMap.js", () => ({
  MarkersMap: ({ label, markers }: { label: string; markers: { label: string }[] }) => (
    <div data-testid="map" aria-label={label} data-labels={markers.map((m) => m.label).join("|")} />
  ),
}));

function card(over: Record<string, unknown> = {}) {
  return {
    id: "r1", status: "open", dogId: "d1", dogName: "Luna", ownerName: "Camila",
    requestedTime: "2026-10-28T22:00:00+00:00", windowEnd: "2026-10-28T23:00:00+00:00",
    durationHours: 0.75, deadlineAt: "2099-01-01T00:00:00+00:00",
    fareCop: 20000, priceCop: 20000, pickupLat: 1.2, pickupLng: -77.2, distanceKm: 0.8,
    myOffer: null, ...over,
  };
}

async function renderScreen(props: Record<string, unknown> = {}) {
  const { WalkerRequestsScreen } = await import("../../apps/web/src/walker/WalkerRequestsScreen.js");
  const user = userEvent.setup();
  render(<WalkerRequestsScreen userId="walker-1" {...props} />);
  return user;
}

/** The screen inside the app's shared online switch, as HomeShell mounts it. */
async function renderWithPresence(props: Record<string, unknown> = {}) {
  const { WalkerRequestsScreen } = await import("../../apps/web/src/walker/WalkerRequestsScreen.js");
  const { WalkerPresenceProvider } = await import("../../apps/web/src/walker/presence.js");
  const user = userEvent.setup();
  render(
    <WalkerPresenceProvider walkerId="walker-1">
      <WalkerRequestsScreen userId="walker-1" {...props} />
    </WalkerPresenceProvider>,
  );
  return user;
}

describe("Walker Solicitudes", () => {
  beforeEach(() => {
    cleanup();
    for (const mock of [mockOpen, mockSend, mockWithdraw, mockMine, mockAvailability, mockSetAvailability]) mock.mockReset();
    mockOpen.mockResolvedValue([card()]);
    mockMine.mockResolvedValue([]);
    mockAvailability.mockResolvedValue({ online: true, updatedAt: "x" });
  });
  afterEach(() => vi.useRealTimers());

  it("draws the card with distance, fare, owner and a countdown", async () => {
    await renderScreen();

    expect(await screen.findByText("Luna")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByText("a 0,8 km")).toBeInTheDocument();
    expect(screen.getByText("$20.000")).toBeInTheDocument();
    expect(screen.getByText("Camila")).toBeInTheDocument();
    expect(screen.getByText(/Cierra en/)).toBeInTheDocument();
  });

  it("accepts the owner's fare in one tap with the ETA at 4,5 km/h", async () => {
    mockSend.mockResolvedValue({ id: "o1", score: 0.8, priceCop: 20000, kind: "accept" });
    const user = await renderScreen();

    await user.click(await screen.findByRole("button", { name: "Aceptar $20.000" }));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith("r1", { kind: "accept", etaMin: 11 }));
  });

  it("counter-offers in steps of $1.000 up to twice the fare", async () => {
    mockSend.mockResolvedValue({ id: "o1", score: 0.8, priceCop: 22000, kind: "counter" });
    const user = await renderScreen();

    await user.click(await screen.findByRole("button", { name: "Contraofertar" }));
    expect(screen.getByText("$21.000")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Subir contraoferta" }));
    await user.click(screen.getByRole("button", { name: "Enviar contraoferta" }));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith("r1", { kind: "counter", priceCop: 22000, etaMin: 11 }));
  });

  it("stops the counter at twice the fare", async () => {
    mockOpen.mockResolvedValue([card({ fareCop: 8000 })]);
    const user = await renderScreen();

    await user.click(await screen.findByRole("button", { name: "Contraofertar" }));
    for (let i = 0; i < 10; i += 1) {
      const up = screen.getByRole("button", { name: "Subir contraoferta" });
      if ((up as HTMLButtonElement).disabled) break;
      await user.click(up);
    }
    expect(screen.getByText("$16.000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir contraoferta" })).toBeDisabled();
  });

  it("replaces the buttons by the sent offer and lets him withdraw it", async () => {
    mockOpen.mockResolvedValue([card({ myOffer: { id: "o1", priceCop: 22000, kind: "counter" } })]);
    mockWithdraw.mockResolvedValue(undefined);
    const user = await renderScreen();

    expect(await screen.findByText("Oferta enviada · $22.000")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aceptar/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirar" }));
    await waitFor(() => expect(mockWithdraw).toHaveBeenCalledWith("r1"));
  });

  it.each([
    [409, "Go online to send offers.", "Conéctate para ofertar"],
    [409, "The request is no longer open.", "El dueño ya eligió"],
    [429, "slow", "Espera un momento"],
  ])("maps %s %s", async (status, detail, copy) => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockSend.mockRejectedValue(new ApiError(detail, status));
    const user = await renderScreen();

    await user.click(await screen.findByRole("button", { name: "Aceptar $20.000" }));
    expect(await screen.findByText(copy)).toBeInTheDocument();
  });

  it("drops the card when the request is no longer visible (403)", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockSend.mockRejectedValue(new ApiError("Walk not visible to you.", 403));
    const user = await renderScreen();

    await user.click(await screen.findByRole("button", { name: "Aceptar $20.000" }));
    await waitFor(() => expect(screen.queryByText("Luna")).not.toBeInTheDocument());
  });

  it("explains an empty inbox", async () => {
    mockOpen.mockResolvedValue([]);
    await renderScreen();
    expect(await screen.findByText(/No hay solicitudes cerca/)).toBeInTheDocument();
  });

  it("polls the inbox every 10 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderScreen();
    await screen.findByText("Luna");
    const before = mockOpen.mock.calls.length;

    await vi.advanceTimersByTimeAsync(10_100);
    expect(mockOpen.mock.calls.length).toBeGreaterThan(before);
  });

  it("lists my offers with their chips and links a won one to Rutas", async () => {
    mockMine.mockResolvedValue([
      { offerId: "o1", requestId: "r1", dogName: "Luna", requestedTime: "2026-10-25T22:00:00+00:00", durationHours: 0.75, fareCop: 20000, priceCop: 22000, kind: "counter", status: "won", requestStatus: "assigned" },
      { offerId: "o2", requestId: "r2", dogName: "Max", requestedTime: "2026-10-25T22:00:00+00:00", durationHours: 0.75, fareCop: 12000, priceCop: 12000, kind: "accept", status: "pending", requestStatus: "open" },
    ]);
    const onGoRoutes = vi.fn();
    const user = await renderScreen({ onGoRoutes });

    await user.click(screen.getByRole("button", { name: "Mis ofertas" }));
    const list = await screen.findByRole("region", { name: "Mis ofertas" });
    expect(await within(list).findByText("Luna · $22.000")).toBeInTheDocument();
    expect(within(list).getAllByText("¡Ganaste!").length).toBeGreaterThan(0);
    expect(within(list).getAllByText("Esperando al dueño").length).toBeGreaterThan(0);
    await user.click(within(list).getByRole("button", { name: "Ver en Rutas" }));
    expect(onGoRoutes).toHaveBeenCalled();
  });

  it("offers the quick raises and sends the chosen one", async () => {
    mockSend.mockResolvedValue({ id: "o1", score: 0.8, priceCop: 22000, kind: "counter" });
    const user = await renderScreen();

    await user.click(await screen.findByRole("button", { name: "Contraofertar" }));
    await user.click(screen.getByRole("button", { name: "+$2.000" }));
    expect(screen.getByText("$22.000")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enviar contraoferta" }));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith("r1", { kind: "counter", priceCop: 22000, etaMin: 11 }));
  });

  it("drops a card by itself when the owner stops taking offers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockOpen.mockResolvedValue([card({ deadlineAt: new Date(Date.now() + 2000).toISOString() })]);
    await renderScreen();
    expect(await screen.findByText("Luna")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(3000);
    await waitFor(() => expect(screen.queryByText("Luna")).not.toBeInTheDocument());
  });

  it("shows the pickup on a map on demand", async () => {
    const user = await renderScreen();

    await user.click(await screen.findByRole("button", { name: "Ver en el mapa" }));
    expect(screen.getByTestId("map")).toHaveAttribute("data-labels", "Recogida · Luna");
  });

  it("asks to connect right here when the walker is offline", async () => {
    mockAvailability.mockResolvedValue({ online: false, updatedAt: null });
    mockOpen.mockResolvedValue([]);
    mockSetAvailability.mockResolvedValue({ online: true, updatedAt: "x" });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 1.21, longitude: -77.28 } }) },
    });
    const user = await renderWithPresence();

    const card = await screen.findByRole("region", { name: "Estás desconectado" });
    expect(screen.getByRole("button", { name: /Desconectado/ })).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Conectarme" }));
    await waitFor(() => expect(mockSetAvailability).toHaveBeenCalledWith("walker-1", true, { lat: 1.21, lng: -77.28 }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Estás desconectado" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /En línea/ })).toBeInTheDocument();
  });

  it("announces a win when an offered request leaves the inbox", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockOpen
      .mockResolvedValueOnce([card({ myOffer: { id: "o1", priceCop: 22000, kind: "counter" } })])
      .mockResolvedValue([]);
    mockMine.mockResolvedValue([
      { offerId: "o1", requestId: "r1", dogName: "Luna", requestedTime: "2026-10-25T22:00:00+00:00", durationHours: 0.75, fareCop: 20000, priceCop: 22000, kind: "counter", status: "won", requestStatus: "assigned" },
    ]);
    const onGoRoutes = vi.fn();
    await renderScreen({ onGoRoutes });
    await screen.findByText("Oferta enviada · $22.000");

    await vi.advanceTimersByTimeAsync(10_100);
    const banner = await screen.findByText("Ganaste el paseo de Luna");
    expect(mockMine).toHaveBeenCalledWith("walker-1", "won");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(within(banner.parentElement as HTMLElement).getByRole("button", { name: "Ver en Rutas" }));
    expect(onGoRoutes).toHaveBeenCalled();
  });

  it("keeps checking my offers while an owner is still deciding", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockMine.mockResolvedValue([
      { offerId: "o2", requestId: "r2", dogName: "Max", requestedTime: "2026-10-25T22:00:00+00:00", durationHours: 0.75, fareCop: 12000, priceCop: 12000, kind: "accept", status: "pending", requestStatus: "open" },
    ]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { WalkerRequestsScreen } = await import("../../apps/web/src/walker/WalkerRequestsScreen.js");
    render(<WalkerRequestsScreen userId="walker-1" />);

    await user.click(await screen.findByRole("button", { name: "Mis ofertas" }));
    await screen.findByText("Max · $12.000");
    const before = mockMine.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_100);
    expect(mockMine.mock.calls.length).toBeGreaterThan(before);
  });
});
