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

vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchOpenRequests: mockOpen,
  sendOffer: mockSend,
  withdrawOffer: mockWithdraw,
  fetchMyOffers: mockMine,
  etaMinutes: (km: number) => Math.round((km / 4.5) * 60),
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

describe("Walker Solicitudes", () => {
  beforeEach(() => {
    cleanup();
    for (const mock of [mockOpen, mockSend, mockWithdraw, mockMine]) mock.mockReset();
    mockOpen.mockResolvedValue([card()]);
    mockMine.mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it("draws the card with distance, fare, owner and a countdown", async () => {
    await renderScreen();

    expect(await screen.findByText(/Luna · 45 min · a 0,8 km/)).toBeInTheDocument();
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
    await waitFor(() => expect(screen.queryByText(/Luna · 45 min/)).not.toBeInTheDocument());
  });

  it("explains an empty inbox", async () => {
    mockOpen.mockResolvedValue([]);
    await renderScreen();
    expect(await screen.findByText(/No hay solicitudes cerca/)).toBeInTheDocument();
  });

  it("polls the inbox every 10 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderScreen();
    await screen.findByText(/Luna · 45 min/);
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
});
