// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Explorar (owner): build the walk (dog, duration, time, pin on the map of
// Pasto), propose a price, send it to every walker; raise it when nobody
// accepts; cancel; or pick a walker directly at their profile price.
// The map is stubbed (a button drops the pin), the API calls are mocked.

const mockFetchDogs = vi.fn();
const mockFetchRequests = vi.fn();
const mockFetchWalkerProfiles = vi.fn();
const mockCreateOpenOffer = vi.fn();
const mockCreateRequest = vi.fn();
const mockRaiseOfferPrice = vi.fn();
const mockCancelRequest = vi.fn();

vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchDogs: mockFetchDogs,
  fetchRequests: mockFetchRequests,
  fetchWalkerProfiles: mockFetchWalkerProfiles,
  createOpenOffer: mockCreateOpenOffer,
  createRequest: mockCreateRequest,
  raiseOfferPrice: mockRaiseOfferPrice,
  cancelRequest: mockCancelRequest,
}));

vi.mock("../../apps/web/src/map/PickupMap.js", () => ({
  PickupMap: ({ lat, lng, onPick }: { lat: string; lng: string; onPick: (a: number, b: number) => void }) => (
    <div data-testid="map" data-lat={lat} data-lng={lng}>
      <button type="button" onClick={() => onPick(1.2136, -77.2811)}>
        Marcar punto
      </button>
    </div>
  ),
}));

const DOGS = [
  { id: "dog-1", name: "Luna" },
  { id: "dog-2", name: "Max" },
];

const WALKERS = [
  { walkerId: "walker-1", displayName: "Nico Walks", bio: null, serviceArea: "Centro", pricePerWalk: 12000 },
];

function offer(over: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    walkerId: null,
    walkerName: null,
    dogId: "dog-1",
    dogName: "Luna",
    status: "pending",
    requestedTime: "2026-10-05T15:00:00.000Z",
    pickupLat: 1.2136,
    pickupLng: -77.2811,
    priceCop: 15000,
    createdAt: "2026-10-01T00:00:00.000Z",
    respondedAt: null,
    ...over,
  };
}

async function importScreen() {
  return import("../../apps/web/src/owner/OwnerExploreScreen.js");
}

async function renderScreen() {
  const { OwnerExploreScreen } = await importScreen();
  const user = userEvent.setup();
  render(<OwnerExploreScreen />);
  await waitFor(() => expect(screen.queryByText("Cargando…")).not.toBeInTheDocument());
  return user;
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Perro"), "dog-1");
  await user.type(screen.getByLabelText("Día y hora"), "2026-10-05T10:00");
  await user.click(screen.getByRole("button", { name: "Marcar punto" }));
}

describe("Owner explore screen", () => {
  beforeEach(() => {
    cleanup();
    for (const mock of [
      mockFetchDogs, mockFetchRequests, mockFetchWalkerProfiles,
      mockCreateOpenOffer, mockCreateRequest, mockRaiseOfferPrice, mockCancelRequest,
    ]) {
      mock.mockReset();
    }
    mockFetchDogs.mockResolvedValue(DOGS);
    mockFetchRequests.mockResolvedValue([]);
    mockFetchWalkerProfiles.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a loading state, then the empty state of the offers", async () => {
    let release: (value: unknown[]) => void = () => undefined;
    mockFetchRequests.mockReturnValue(new Promise<unknown[]>((resolve) => { release = resolve; }));
    const { OwnerExploreScreen } = await importScreen();
    render(<OwnerExploreScreen />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    release([]);

    expect(await screen.findByText("Todavía no has enviado ofertas.")).toBeInTheDocument();
    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
  });

  it("translates a network failure to Spanish", async () => {
    mockFetchDogs.mockRejectedValue(new Error("Failed to fetch"));
    const { OwnerExploreScreen } = await importScreen();
    render(<OwnerExploreScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos conectar con el servidor. Revisa que la API esté encendida.",
    );
  });

  it("lists the dogs and starts at the suggested fare for 45 minutes", async () => {
    await renderScreen();

    const select = screen.getByLabelText("Perro");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Elige a tu perro",
      "Luna",
      "Max",
    ]);
    expect(screen.getByRole("radio", { name: "45 min" })).toBeChecked();
    expect(screen.getByText("$15.000")).toBeInTheDocument();
  });

  it("follows the duration and moves the fare in steps of $1.000 within the limits", async () => {
    const user = await renderScreen();

    await user.click(screen.getByRole("radio", { name: "60 min" }));
    expect(screen.getByText("$20.000")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Subir tarifa" }));
    expect(screen.getByText("$21.000")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "30 min" }));
    for (let step = 0; step < 4; step += 1) {
      await user.click(screen.getByRole("button", { name: "Bajar tarifa" }));
    }
    expect(screen.getByText("$8.000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bajar tarifa" })).toBeDisabled();
  });

  it("asks for the dog, the time and the pin and sends nothing while they are missing", async () => {
    const user = await renderScreen();

    await user.click(screen.getByRole("button", { name: "Enviar oferta a los cuidadores" }));

    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "Elige a tu perro.",
      "Elige el día y la hora del paseo.",
      "Marca en el mapa dónde recogen a tu perro (dentro de Pasto).",
    ]);
    expect(mockCreateOpenOffer).not.toHaveBeenCalled();
  });

  it("sends the exact offer: dog, time, pin from the map and the proposed price", async () => {
    mockCreateOpenOffer.mockResolvedValue(offer());
    const user = await renderScreen();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Subir tarifa" }));
    await user.click(screen.getByRole("button", { name: "Enviar oferta a los cuidadores" }));

    await waitFor(() => expect(mockCreateOpenOffer).toHaveBeenCalledTimes(1));
    expect(mockCreateOpenOffer).toHaveBeenCalledWith({
      dogId: "dog-1",
      requestedTime: new Date("2026-10-05T10:00").toISOString(),
      pickupLat: 1.2136,
      pickupLng: -77.2811,
      priceCop: 16000,
    });
    expect(await screen.findByText("Oferta de $16.000 enviada a todos los cuidadores.")).toBeInTheDocument();
    expect(mockFetchRequests).toHaveBeenCalledTimes(2);
  });

  it("feeds the pin dropped on the map to the map component", async () => {
    const user = await renderScreen();
    await user.click(screen.getByRole("button", { name: "Marcar punto" }));

    expect(screen.getByTestId("map")).toHaveAttribute("data-lat", "1.2136");
    expect(screen.getByTestId("map")).toHaveAttribute("data-lng", "-77.2811");
  });

  it("shows the API rejection in Spanish and keeps the form", async () => {
    mockCreateOpenOffer.mockRejectedValue(new Error("This dog already has an active request for that time."));
    const user = await renderScreen();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Enviar oferta a los cuidadores" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ese perro ya tiene un paseo a esa hora.");
    expect(screen.getByLabelText("Perro")).toHaveValue("dog-1");
  });

  it("shows an open offer as searching and raises its price by $1.000", async () => {
    mockFetchRequests.mockResolvedValue([offer()]);
    mockRaiseOfferPrice.mockResolvedValue(offer({ priceCop: 16000 }));
    const user = await renderScreen();

    expect(screen.getByText("Buscando cuidador…")).toBeInTheDocument();
    mockFetchRequests.mockResolvedValue([offer({ priceCop: 16000 })]);
    await user.click(screen.getByRole("button", { name: "Subir $1.000" }));

    await waitFor(() => expect(mockRaiseOfferPrice).toHaveBeenCalledWith("req-1", 16000));
    expect(
      await screen.findByText("Subiste la oferta a $16.000 y volvimos a avisar a los cuidadores."),
    ).toBeInTheDocument();
    expect(screen.getByText(/\$16\.000$/)).toBeInTheDocument();
  });

  it("disables raising once the offer is at the maximum", async () => {
    mockFetchRequests.mockResolvedValue([offer({ priceCop: 60000 })]);
    await renderScreen();

    expect(screen.getByRole("button", { name: "Subir $1.000" })).toBeDisabled();
  });

  it("cancels an offer", async () => {
    mockFetchRequests.mockResolvedValue([offer()]);
    mockCancelRequest.mockResolvedValue({ id: "req-1", status: "cancelled" });
    const user = await renderScreen();
    mockFetchRequests.mockResolvedValue([offer({ status: "cancelled" })]);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(mockCancelRequest).toHaveBeenCalledWith("req-1"));
    expect(await screen.findByText("Cancelaste la oferta.")).toBeInTheDocument();
    expect(screen.getByText("Cancelado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subir $1.000" })).not.toBeInTheDocument();
  });

  it("shows who accepted and offers no more actions", async () => {
    mockFetchRequests.mockResolvedValue([
      offer({ status: "accepted", walkerId: "walker-1", walkerName: "Nico Walks" }),
    ]);
    await renderScreen();

    expect(screen.getByText("Aceptado por Nico Walks")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subir $1.000" })).not.toBeInTheDocument();
  });

  it("sends a direct request to the picked walker without any price", async () => {
    mockFetchWalkerProfiles.mockResolvedValue(WALKERS);
    mockCreateRequest.mockResolvedValue(offer({ walkerId: "walker-1", walkerName: "Nico Walks" }));
    const user = await renderScreen();
    await fillValidForm(user);

    await user.click(screen.getByRole("button", { name: "Pedir a Nico Walks" }));

    await waitFor(() => expect(mockCreateRequest).toHaveBeenCalledTimes(1));
    expect(mockCreateRequest).toHaveBeenCalledWith({
      walkerId: "walker-1",
      dogId: "dog-1",
      requestedTime: new Date("2026-10-05T10:00").toISOString(),
      pickupLat: 1.2136,
      pickupLng: -77.2811,
    });
    expect(mockCreateOpenOffer).not.toHaveBeenCalled();
    expect(await screen.findByText("Solicitud enviada a Nico Walks.")).toBeInTheDocument();
  });

  it("does not offer direct walkers when there are none", async () => {
    await renderScreen();
    expect(screen.queryByText("O elige un cuidador")).not.toBeInTheDocument();
  });

  it("refreshes the offers while one is still searching, and only then", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    mockFetchRequests.mockResolvedValue([offer()]);
    await renderScreen();
    expect(mockFetchRequests).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(8000);
    expect(mockFetchRequests).toHaveBeenCalledTimes(2);

    mockFetchRequests.mockResolvedValue([
      offer({ status: "accepted", walkerId: "walker-1", walkerName: "Nico Walks" }),
    ]);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await screen.findByText("Aceptado por Nico Walks")).toBeInTheDocument();

    const callsAfterAccept = mockFetchRequests.mock.calls.length;
    await vi.advanceTimersByTimeAsync(24000);
    expect(mockFetchRequests).toHaveBeenCalledTimes(callsAfterAccept);
  });
});
