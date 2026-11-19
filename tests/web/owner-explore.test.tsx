// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Explorar (owner), docs/frontend/explorar.md: fare suggestion, nearby walkers,
// POST /bidding/requests, the optional assistant, ranked offers polled with an
// ETag, pick, and the paginated list of open requests. The pickup field starts from the saved
// home (localStorage); the geocoder and every API call are mocked.

const mockFetchDogs = vi.fn();
const mockFareSuggestion = vi.fn();
const mockNearby = vi.fn();
const mockCreate = vi.fn();
const mockParse = vi.fn();
const mockFetchOffers = vi.fn();
const mockPick = vi.fn();
const mockOwnerRequests = vi.fn();
const mockCancel = vi.fn();
const mockRaise = vi.fn();
const mockProfile = vi.fn();
const mockSearch = vi.fn();
const mockReverse = vi.fn();

vi.mock("../../apps/web/src/lib/api.js", () => ({ fetchDogs: mockFetchDogs }));
vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  WALK_DURATIONS: [30, 45, 60, 90, 120],
  fetchFareSuggestion: mockFareSuggestion,
  fetchNearbyWalkers: mockNearby,
  createBiddingRequest: mockCreate,
  parseRequestText: mockParse,
  fetchOffers: mockFetchOffers,
  pickOffer: mockPick,
  fetchOwnerRequests: mockOwnerRequests,
  cancelWalk: mockCancel,
  raiseRequest: mockRaise,
  fetchOwnerProfile: mockProfile,
  searchAddress: mockSearch,
  reverseAddress: mockReverse,
}));

const HOME_KEY = "cantrack.homePoint";
const RECENTS_KEY = "cantrack.recentPickups";
const SAVED_HOME = { lat: 1.2136, lng: -77.2811, label: "Calle 18 22-10" };

const DOGS = [
  { id: "dog-1", name: "Luna" },
  { id: "dog-2", name: "Max" },
];

function offer(over: Record<string, unknown> = {}) {
  return {
    offerId: "o1",
    walkerId: "w1",
    walkerName: "Mateo",
    priceCop: 14000,
    etaMin: 10,
    distanceKm: 0.6,
    score: 0.9,
    scoreParts: { price: 0.5, distance: 0.9, rating: 0.7 },
    recentRating: 4.8,
    allTimeRating: 4.8,
    ratingCount: 23,
    ...over,
  };
}

function created(over: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    status: "open",
    dogId: "dog-1",
    requestedTime: "2099-01-01T15:00:00+00:00",
    windowEnd: "2099-01-01T16:00:00+00:00",
    durationHours: 0.75,
    priceCop: 15000,
    pickupLat: 1.2136,
    pickupLng: -77.2811,
    deadlineAt: "2099-01-01T14:30:00+00:00",
    ...over,
  };
}

async function renderScreen(props: { onPicked?: () => void } = {}) {
  const { OwnerExploreScreen } = await import("../../apps/web/src/owner/OwnerExploreScreen.js");
  const user = userEvent.setup();
  render(<OwnerExploreScreen userId="owner-1" {...props} />);
  await waitFor(() => expect(mockFetchDogs).toHaveBeenCalled());
  await screen.findByRole("radio", { name: "Luna" });
  return user;
}

async function fillAndPublish(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "Luna" }));
  await user.type(screen.getByLabelText("Día y hora"), "2099-01-01T10:00");
  await user.click(screen.getByRole("button", { name: "Publicar" }));
}

describe("Owner Explorar (bidding)", () => {
  beforeEach(() => {
    cleanup();
    for (const mock of [mockFetchDogs, mockFareSuggestion, mockNearby, mockCreate, mockParse, mockFetchOffers, mockPick, mockOwnerRequests, mockCancel, mockRaise, mockProfile, mockSearch, mockReverse]) {
      mock.mockReset();
    }
    window.localStorage.clear();
    window.localStorage.setItem(HOME_KEY, JSON.stringify(SAVED_HOME));
    mockFetchDogs.mockResolvedValue(DOGS);
    mockFareSuggestion.mockResolvedValue({ suggestedCop: 15000, basis: "market", sampleSize: 12, minCop: 8000, stepCop: 1000, maxCop: 45000 });
    mockNearby.mockResolvedValue({ count: 4, radiusKm: 2 });
    mockOwnerRequests.mockResolvedValue({ items: [], nextCursor: null });
    mockFetchOffers.mockResolvedValue({ offers: [], etag: null });
    // The pickup field searches on a debounce, so a test that only types must
    // still get a promise back: a bare mock returns undefined and the rejection
    // surfaces after the test ends.
    mockSearch.mockResolvedValue({ status: "ok", results: [] });
    mockReverse.mockResolvedValue({ status: "ok", label: null, detail: null });
    mockProfile.mockResolvedValue({ walkers: [] });
  });

  afterEach(() => vi.useRealTimers());

  it("starts the fare at the suggestion and shows the nearby walkers", async () => {
    await renderScreen();

    expect(await screen.findByText("4 paseadores cerca")).toBeInTheDocument();
    expect(await screen.findByText("Precio típico en tu zona: $15.000")).toBeInTheDocument();
    expect(mockFareSuggestion).toHaveBeenCalledWith(45, expect.any(Number), expect.any(Number));
  });

  it("explains when nobody is nearby but still lets the owner publish", async () => {
    mockNearby.mockResolvedValue({ count: 0, radiusKm: 2 });
    await renderScreen();

    expect(
      await screen.findByText("Ahora no hay paseadores cerca; tu solicitud igual quedará publicada"),
    ).toBeInTheDocument();
  });

  it("refetches the suggestion only when the duration changes", async () => {
    const user = await renderScreen();
    await waitFor(() => expect(mockFareSuggestion).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("radio", { name: "60 min" }));
    await waitFor(() => expect(mockFareSuggestion).toHaveBeenCalledTimes(2));
    expect(mockFareSuggestion).toHaveBeenLastCalledWith(60, expect.any(Number), expect.any(Number));
  });

  it("types the offer on the number pad and publishes that price", async () => {
    const user = await renderScreen();
    await user.click(screen.getByRole("button", { name: /Editar oferta/ }));
    for (const digit of ["2", "3", "5", "0", "0"]) {
      await user.click(screen.getByRole("button", { name: digit }));
    }
    await user.click(screen.getByRole("button", { name: "Listo" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar oferta, $23.500" })).toBeInTheDocument();
    await fillAndPublish(user);
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ priceCop: 23500 })));
  });

  it("stops the offer at three times the recommended price", async () => {
    // Recommended $15.000 (the mock above), so the ceiling is $45.000.
    const user = await renderScreen();
    await user.click(screen.getByRole("button", { name: /Editar oferta/ }));
    expect(screen.getByText(/máximo \$45\.000/)).toBeInTheDocument();
    for (const digit of ["4", "6", "0", "0", "0"]) {
      await user.click(screen.getByRole("button", { name: digit }));
    }
    expect(screen.getByRole("button", { name: "Listo" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Borrar" }));
    await user.click(screen.getByRole("button", { name: "Borrar" }));
    await user.click(screen.getByRole("button", { name: "Borrar" }));
    await user.click(screen.getByRole("button", { name: "Borrar" }));
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "000" }));
    await user.click(screen.getByRole("button", { name: "Listo" }));

    expect(screen.getByRole("button", { name: "Editar oferta, $45.000" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir tarifa" })).toBeDisabled();
  });

  it("validates the form before calling the API", async () => {
    const user = await renderScreen();
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    expect(screen.getByText("Elige a tu perro.")).toBeInTheDocument();
    expect(screen.getByText("Elige el día y la hora del paseo.")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("publishes the request and ranks the offers with the best one first", async () => {
    mockCreate.mockResolvedValue(created());
    mockFetchOffers.mockResolvedValue({
      offers: [offer(), offer({ offerId: "o2", walkerName: "Sara", ratingCount: 0, allTimeRating: null, priceCop: 16000 })],
      etag: '"v1"',
    });
    const user = await renderScreen();
    await fillAndPublish(user);

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          dogId: "dog-1",
          durationMinutes: 45,
          priceCop: 15000,
          pickupLat: 1.2136,
          pickupLng: -77.2811,
          pickupLabel: "Calle 18 22-10",
          windowStart: new Date("2099-01-01T10:00").toISOString(),
        }),
      ),
    );

    const panel = await screen.findByRole("region", { name: "Ofertas recibidas" });
    const cards = await within(panel).findAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText("Mejor opción · el más cerca")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("Mateo")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("★ 4.8 (23)")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("a 0,6 km")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("llega en 10 min")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("$14.000")).toBeInTheDocument();
    expect(within(cards[1]!).getByText("Sara")).toBeInTheDocument();
    expect(within(cards[1]!).getByText("Nuevo")).toBeInTheDocument();
    expect(within(cards[1]!).queryByText(/Mejor opción/)).not.toBeInTheDocument();
  });

  describe("the pickup field", () => {
    it("starts on the saved home, as text", async () => {
      await renderScreen();
      expect(screen.getByRole("combobox", { name: "Dirección de recogida" })).toHaveValue("Calle 18 22-10");
    });

    it("starts empty with no saved home, does not suggest a fare yet, and asks for a pickup on publish", async () => {
      window.localStorage.clear();
      const user = await renderScreen();
      expect(screen.getByRole("combobox", { name: "Dirección de recogida" })).toHaveValue("");
      expect(mockFareSuggestion).not.toHaveBeenCalled();

      await user.click(screen.getByRole("radio", { name: "Luna" }));
      await user.type(screen.getByLabelText("Día y hora"), "2099-01-01T10:00");
      await user.click(screen.getByRole("button", { name: "Publicar" }));

      expect(screen.getByText("Elige dónde recogen a tu perro (dentro de Pasto).")).toBeInTheDocument();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("a home saved outside Pasto is ignored", async () => {
      window.localStorage.setItem(HOME_KEY, JSON.stringify({ lat: 4.6, lng: -74.08, label: "Bogotá" }));
      await renderScreen();
      expect(screen.getByRole("combobox", { name: "Dirección de recogida" })).toHaveValue("");
    });

    it("a home saved before labels existed still fills the field", async () => {
      window.localStorage.setItem(HOME_KEY, JSON.stringify({ lat: 1.2136, lng: -77.2811 }));
      await renderScreen();
      expect(screen.getByRole("combobox", { name: "Dirección de recogida" })).toHaveValue("Mi casa");
    });

    it("fills the field from the profile's home when nothing was saved on this device", async () => {
      window.localStorage.clear();
      mockProfile.mockResolvedValue({ walkers: [], home: { lat: 1.22, lng: -77.28, label: "Carrera 27 15-30" } });
      await renderScreen();
      await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Dirección de recogida" })).toHaveValue("Carrera 27 15-30"),
      );
      await waitFor(() => expect(mockFareSuggestion).toHaveBeenCalledWith(45, 1.22, -77.28));
    });

    it("does not overwrite what the owner already chose with a late profile answer", async () => {
      window.localStorage.clear();
      let answer: (value: unknown) => void = () => undefined;
      mockProfile.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
      mockSearch.mockResolvedValue({ status: "ok", results: [{ label: "Plaza de Nariño", detail: "Centro, Pasto", lat: 1.2146, lng: -77.2786 }] });
      const user = await renderScreen();

      await user.type(screen.getByRole("combobox", { name: "Dirección de recogida" }), "plaza");
      await user.click(await screen.findByRole("option", { name: /Plaza de Nariño/ }));
      answer({ walkers: [], home: { lat: 1.22, lng: -77.28, label: "Carrera 27 15-30" } });

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(screen.getByRole("combobox", { name: "Dirección de recogida" })).toHaveValue("Plaza de Nariño");
    });

    it("publishes the address the owner typed and picked, and remembers it for next time", async () => {
      mockCreate.mockResolvedValue(created());
      mockSearch.mockResolvedValue({ status: "ok", results: [{ label: "Plaza de Nariño", detail: "Centro, Pasto", lat: 1.2146, lng: -77.2786 }] });
      const user = await renderScreen();

      const box = screen.getByRole("combobox", { name: "Dirección de recogida" });
      await user.clear(box);
      await user.type(box, "plaza");
      await user.click(await screen.findByRole("option", { name: /Plaza de Nariño/ }));
      await waitFor(() => expect(mockFareSuggestion).toHaveBeenLastCalledWith(45, 1.2146, -77.2786));
      await fillAndPublish(user);

      await waitFor(() =>
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({ pickupLat: 1.2146, pickupLng: -77.2786, pickupLabel: "Plaza de Nariño" }),
        ),
      );
      expect(JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? "[]")).toEqual([
        { label: "Plaza de Nariño", lat: 1.2146, lng: -77.2786 },
      ]);
    });

    it("typing without picking leaves no pickup, so publishing is refused", async () => {
      const user = await renderScreen();
      const box = screen.getByRole("combobox", { name: "Dirección de recogida" });
      await user.clear(box);
      await user.type(box, "pla");
      await fillAndPublish(user);

      expect(screen.getByText("Elige dónde recogen a tu perro (dentro de Pasto).")).toBeInTheDocument();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("Enter in the box never publishes the form", async () => {
      const user = await renderScreen();
      await user.click(screen.getByRole("radio", { name: "Luna" }));
      await user.type(screen.getByLabelText("Día y hora"), "2099-01-01T10:00");
      await user.click(screen.getByRole("combobox", { name: "Dirección de recogida" }));
      await user.keyboard("{Enter}");
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  it("picks an offer and hands over to Mis paseos", async () => {
    mockCreate.mockResolvedValue(created());
    mockFetchOffers.mockResolvedValue({ offers: [offer()], etag: '"v1"' });
    mockPick.mockResolvedValue({});
    const onPicked = vi.fn();
    const user = await renderScreen({ onPicked });
    await fillAndPublish(user);

    await user.click(await screen.findByRole("button", { name: "Elegir a Mateo" }));
    await waitFor(() => expect(mockPick).toHaveBeenCalledWith("req-1", "o1"));
    expect(onPicked).toHaveBeenCalled();
  });

  it("explains a 409 on pick and keeps polling", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockCreate.mockResolvedValue(created());
    mockFetchOffers.mockResolvedValue({ offers: [offer()], etag: '"v1"' });
    mockPick.mockRejectedValue(new ApiError("conflict", 409));
    const user = await renderScreen();
    await fillAndPublish(user);

    await user.click(await screen.findByRole("button", { name: "Elegir a Mateo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Otro paseador ya fue asignado o la solicitud cambió",
    );
  });

  it("polls the offers every 4 s with the last ETag", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockCreate.mockResolvedValue(created());
    mockFetchOffers.mockResolvedValueOnce({ offers: [offer()], etag: '"v1"' }).mockResolvedValue({ offers: null, etag: '"v1"' });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const { OwnerExploreScreen } = await import("../../apps/web/src/owner/OwnerExploreScreen.js");
    render(<OwnerExploreScreen userId="owner-1" />);
    await screen.findByRole("radio", { name: "Luna" });
    await fillAndPublish(user);
    await screen.findByText("★ 4.8 (23)");

    await vi.advanceTimersByTimeAsync(4100);
    expect(mockFetchOffers).toHaveBeenLastCalledWith("req-1", '"v1"');
    // A 304 keeps the list on screen.
    expect(screen.getByText("★ 4.8 (23)")).toBeInTheDocument();
  });

  it("raises the same request $2.000 when nobody offered by the deadline (no duplicate)", async () => {
    mockCreate.mockResolvedValue(created({ deadlineAt: "2000-01-01T00:00:00+00:00" }));
    mockRaise.mockResolvedValue({ id: "req-1", priceCop: 17000, deadlineAt: "2099-01-01T00:00:00+00:00" });
    const user = await renderScreen();
    await fillAndPublish(user);

    await user.click(await screen.findByRole("button", { name: "Subir $2.000 y volver a abrir" }));
    await waitFor(() => expect(mockRaise).toHaveBeenCalledWith("req-1", 17000));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Subimos tu oferta a $17.000 y la volvimos a abrir.")).toBeInTheDocument();
  });

  it("cancels the open request after a confirmation", async () => {
    mockCreate.mockResolvedValue(created());
    mockCancel.mockResolvedValue({ id: "req-1", status: "cancelled" });
    const user = await renderScreen();
    await fillAndPublish(user);

    await user.click(await screen.findByRole("button", { name: "Cancelar solicitud" }));
    expect(mockCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("req-1"));
    expect(await screen.findByText("Cancelamos tu solicitud.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ofertas recibidas" })).not.toBeInTheDocument();
  });

  it("marks the offers of a favorite walker", async () => {
    mockProfile.mockResolvedValue({ walkers: [{ walkerId: "w1", name: "Mateo", walks: 3, favorite: true }] });
    mockCreate.mockResolvedValue(created());
    mockFetchOffers.mockResolvedValue({ offers: [offer(), offer({ offerId: "o2", walkerId: "w2", walkerName: "Sara" })], etag: '"v1"' });
    const user = await renderScreen();
    await fillAndPublish(user);

    const cards = await within(await screen.findByRole("region", { name: "Ofertas recibidas" })).findAllByRole("listitem");
    expect(within(cards[0]!).getByText("❤ Tu favorito")).toBeInTheDocument();
    expect(within(cards[1]!).queryByText("❤ Tu favorito")).not.toBeInTheDocument();
  });

  it("asks to add a dog first when the owner has none", async () => {
    mockFetchDogs.mockResolvedValue([]);
    const onGo = vi.fn();
    const { OwnerExploreScreen } = await import("../../apps/web/src/owner/OwnerExploreScreen.js");
    const user = userEvent.setup();
    render(<OwnerExploreScreen userId="owner-1" onGo={onGo} />);

    await user.click(await screen.findByRole("button", { name: "Agregar mi perro" }));
    expect(onGo).toHaveBeenCalledWith("dogs");
    expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();
  });

  it("fills the form from the assistant, highlights what is missing and never publishes", async () => {
    mockParse.mockResolvedValue({
      draft: { dogId: "dog-2", durationMinutes: 60, priceCop: 18000 },
      missing: ["windowStart"],
      aiStatus: "ok",
    });
    const user = await renderScreen();

    await user.type(screen.getByLabelText("Escríbelo y lo lleno yo"), "Max una hora 18 mil");
    await user.click(screen.getByRole("button", { name: "Llenar con el asistente" }));

    expect(await screen.findByText("Completa: hora")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Max" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "60 min" })).toBeChecked();
    expect(screen.getAllByText("$18.000").length).toBeGreaterThan(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("tells the owner when the assistant did not answer, and hides it on 503", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockParse.mockResolvedValueOnce({ draft: {}, missing: [], aiStatus: "unavailable" });
    const user = await renderScreen();

    await user.type(screen.getByLabelText("Escríbelo y lo lleno yo"), "hola");
    await user.click(screen.getByRole("button", { name: "Llenar con el asistente" }));
    expect(await screen.findByText("El asistente no respondió; llena el formulario")).toBeInTheDocument();

    mockParse.mockRejectedValueOnce(new ApiError("down", 503));
    await user.click(screen.getByRole("button", { name: "Llenar con el asistente" }));
    await waitFor(() => expect(screen.queryByLabelText("Escríbelo y lo lleno yo")).not.toBeInTheDocument());
  });

  it("lists the open requests, pages with the cursor and reopens the offers of one", async () => {
    const item = { id: "r1", status: "open", dogId: "dog-1", dogName: "Luna", requestedTime: "2026-10-28T13:00:00+00:00", durationHours: 0.75, priceCop: 12000, offerCount: 3, deadlineAt: "2099-01-01T00:00:00+00:00", walkerId: null };
    mockOwnerRequests
      .mockResolvedValueOnce({ items: [item], nextCursor: "c1" })
      .mockResolvedValueOnce({ items: [{ ...item, id: "r2", dogName: "Max" }], nextCursor: null });
    mockFetchOffers.mockResolvedValue({ offers: [offer()], etag: '"v1"' });
    const user = await renderScreen();

    expect(await screen.findByText(/Luna · \$12\.000/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver más" }));
    expect(await screen.findByText(/Max · \$12\.000/)).toBeInTheDocument();
    expect(mockOwnerRequests).toHaveBeenLastCalledWith("owner-1", "open", "c1");

    await user.click(screen.getByRole("button", { name: "Ver ofertas de Luna" }));
    expect(await screen.findByRole("region", { name: "Ofertas recibidas" })).toBeInTheDocument();
    expect(mockFetchOffers).toHaveBeenCalledWith("r1", null);
  });

  it("shows the server error code on a 5xx", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    const failure = new ApiError("boom", 500);
    failure.errorId = "e-77";
    mockCreate.mockRejectedValue(failure);
    const user = await renderScreen();
    await fillAndPublish(user);

    expect(await screen.findByText("Algo falló de nuestro lado. Código: e-77")).toBeInTheDocument();
  });
});
