// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Solicitudes (walker): the open offers owners are waiting on. First to
// accept wins (a 409 for the others), declining only hides the offer for this
// walker, the pin and the owner never appear here.

const mockFetchOpenOffers = vi.fn();
const mockAcceptOpenOffer = vi.fn();
const mockDeclineOpenOffer = vi.fn();

vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchOpenOffers: mockFetchOpenOffers,
  acceptOpenOffer: mockAcceptOpenOffer,
  declineOpenOffer: mockDeclineOpenOffer,
}));

function offer(id: string, name: string, priceCop: number, over: Record<string, unknown> = {}) {
  return {
    id,
    status: "pending",
    requestedTime: "2026-10-05T15:00:00.000Z",
    priceCop,
    createdAt: "2026-10-01T00:00:00.000Z",
    dog: { name, breed: "Criollo", size: "medium", temperament: "friendly" },
    ...over,
  };
}

async function importScreen() {
  return import("../../apps/web/src/walker/WalkerOffersScreen.js");
}

async function renderScreen() {
  const { WalkerOffersScreen } = await importScreen();
  const user = userEvent.setup();
  render(<WalkerOffersScreen />);
  await waitFor(() => expect(screen.queryByText("Cargando…")).not.toBeInTheDocument());
  return user;
}

describe("Walker offers screen", () => {
  beforeEach(() => {
    cleanup();
    mockFetchOpenOffers.mockReset();
    mockAcceptOpenOffer.mockReset();
    mockDeclineOpenOffer.mockReset();
    mockFetchOpenOffers.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a loading state, then the empty state", async () => {
    let release: (value: unknown[]) => void = () => undefined;
    mockFetchOpenOffers.mockReturnValue(new Promise<unknown[]>((resolve) => { release = resolve; }));
    const { WalkerOffersScreen } = await importScreen();
    render(<WalkerOffersScreen />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    release([]);

    expect(
      await screen.findByText("No hay ofertas por ahora. Te avisamos aquí cuando llegue una."),
    ).toBeInTheDocument();
  });

  it("translates a load failure to Spanish and shows no empty state", async () => {
    mockFetchOpenOffers.mockRejectedValue(new Error("Failed to fetch"));
    const { WalkerOffersScreen } = await importScreen();
    render(<WalkerOffersScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos conectar con el servidor. Revisa que la API esté encendida.",
    );
    expect(screen.queryByText(/No hay ofertas por ahora/)).not.toBeInTheDocument();
  });

  it("lists each offer with dog, price and the limited dog details only", async () => {
    mockFetchOpenOffers.mockResolvedValue([offer("o1", "Luna", 15000), offer("o2", "Max", 12000)]);
    await renderScreen();

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("Luna · $15.000")).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText("Criollo · medium · friendly")).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText("Max · $12.000")).toBeInTheDocument();
    expect(within(screen.getByRole("list")).queryByText(/latitud|longitud|pickup|dueño/i)).not.toBeInTheDocument();
  });

  it("accepts an offer, removes it and confirms the price", async () => {
    mockFetchOpenOffers.mockResolvedValue([offer("o1", "Luna", 15000), offer("o2", "Max", 12000)]);
    mockAcceptOpenOffer.mockResolvedValue({ id: "o1", status: "accepted", respondedAt: "x", conflicts: [] });
    const user = await renderScreen();

    await user.click(screen.getByRole("button", { name: "Aceptar a Luna" }));

    await waitFor(() => expect(mockAcceptOpenOffer).toHaveBeenCalledWith("o1"));
    expect(await screen.findByText("Aceptaste el paseo de Luna por $15.000.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aceptar a Luna" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceptar a Max" })).toBeInTheDocument();
  });

  it("warns when the accepted walk overlaps another one", async () => {
    mockFetchOpenOffers.mockResolvedValue([offer("o1", "Luna", 15000)]);
    mockAcceptOpenOffer.mockResolvedValue({
      id: "o1",
      status: "accepted",
      respondedAt: "x",
      conflicts: [{ requestId: "r9", requestedTime: "2026-10-05T15:30:00.000Z" }],
    });
    const user = await renderScreen();

    await user.click(screen.getByRole("button", { name: "Aceptar a Luna" }));

    expect(
      await screen.findByText("Aceptaste el paseo de Luna. Ojo: se cruza con 1 de tus paseos."),
    ).toBeInTheDocument();
  });

  it("explains in Spanish when another walker was faster and reloads the list", async () => {
    mockFetchOpenOffers.mockResolvedValueOnce([offer("o1", "Luna", 15000)]);
    mockAcceptOpenOffer.mockRejectedValue(new Error("This offer is no longer available."));
    const user = await renderScreen();
    mockFetchOpenOffers.mockResolvedValue([]);

    await user.click(screen.getByRole("button", { name: "Aceptar a Luna" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Otro cuidador ya tomó esta oferta o el dueño la canceló.",
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Aceptar a Luna" })).not.toBeInTheDocument());
  });

  it("tells a walker without a profile what to do", async () => {
    mockFetchOpenOffers.mockResolvedValue([offer("o1", "Luna", 15000)]);
    mockAcceptOpenOffer.mockRejectedValue(
      new Error("Create your walker profile before accepting offers."),
    );
    const user = await renderScreen();

    await user.click(screen.getByRole("button", { name: "Aceptar a Luna" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Crea tu perfil de cuidador antes de aceptar ofertas.",
    );
  });

  it("declines an offer for this walker and removes it", async () => {
    mockFetchOpenOffers.mockResolvedValue([offer("o1", "Luna", 15000), offer("o2", "Max", 12000)]);
    mockDeclineOpenOffer.mockResolvedValue({ id: "o1", declined: true });
    const user = await renderScreen();

    await user.click(screen.getByRole("button", { name: "Rechazar a Luna" }));

    await waitFor(() => expect(mockDeclineOpenOffer).toHaveBeenCalledWith("o1"));
    await waitFor(() => expect(screen.queryByText("Luna · $15.000")).not.toBeInTheDocument());
    expect(screen.getByText("Max · $12.000")).toBeInTheDocument();
    expect(mockAcceptOpenOffer).not.toHaveBeenCalled();
  });

  it("keeps the offer when declining fails", async () => {
    mockFetchOpenOffers.mockResolvedValue([offer("o1", "Luna", 15000)]);
    mockDeclineOpenOffer.mockRejectedValue(new Error("Request not found."));
    const user = await renderScreen();

    await user.click(screen.getByRole("button", { name: "Rechazar a Luna" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No encontramos esa oferta.");
    expect(screen.getByText("Luna · $15.000")).toBeInTheDocument();
  });

  it("polls for new offers every 8 seconds and stops when it unmounts", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { WalkerOffersScreen } = await importScreen();
    const { unmount } = render(<WalkerOffersScreen />);
    await waitFor(() => expect(mockFetchOpenOffers).toHaveBeenCalledTimes(1));

    mockFetchOpenOffers.mockResolvedValue([offer("o9", "Nala", 18000)]);
    await vi.advanceTimersByTimeAsync(8000);
    expect(mockFetchOpenOffers).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Nala · $18.000")).toBeInTheDocument();

    unmount();
    await vi.advanceTimersByTimeAsync(24000);
    expect(mockFetchOpenOffers).toHaveBeenCalledTimes(2);
  });
});
