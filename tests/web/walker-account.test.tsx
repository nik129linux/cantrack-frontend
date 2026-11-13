// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Walker Rutas, Clientes and Perfil (walker-rutas.md, walker-clientes.md,
// walker-perfil.md): everything is drawn from the server's answer.

vi.mock("../../apps/web/src/lib/supabase.js", () => ({ supabase: { auth: {} } }));
vi.mock("../../apps/web/src/map/MarkersMap.js", () => ({
  MarkersMap: ({ label, markers, path }: { label: string; markers: { label: string }[]; path?: unknown[] | null }) => (
    <div
      data-testid="map"
      aria-label={label}
      data-labels={markers.map((m) => m.label).join("|")}
      data-path={path ? String(path.length) : "0"}
    />
  ),
}));

const mockRoute = vi.fn();
const mockDetail = vi.fn();
const mockGps = vi.fn();
const mockCheckIn = vi.fn();
const mockCheckOut = vi.fn();
const mockCancel = vi.fn();
const mockWalkingRoute = vi.fn();
const mockClients = vi.fn();
const mockClient = vi.fn();
const mockSaveNote = vi.fn();
const mockProfile = vi.fn();
const mockSave = vi.fn();
const mockAvatar = vi.fn();
const mockConsent = vi.fn();
const mockWalks = vi.fn();

vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchDayRoute: mockRoute,
  fetchWalkDetail: mockDetail,
  sendGpsPoints: mockGps,
  checkInWalk: mockCheckIn,
  checkOutWalk: mockCheckOut,
  walkerCancelWalk: mockCancel,
  fetchWalkingRoute: mockWalkingRoute,
  fetchClientList: mockClients,
  fetchClientDetail: mockClient,
  saveDogNote: mockSaveNote,
  fetchWalkerAccountProfile: mockProfile,
  saveWalkerAccountProfile: mockSave,
  uploadWalkerAvatar: mockAvatar,
  recordWalkerConsent: mockConsent,
  fetchWalkerWalks: mockWalks,
  deleteWalkerAccount: vi.fn(),
  deleteOwnerAccount: vi.fn(),
  downloadExport: vi.fn(),
  changePassword: vi.fn(),
}));

function stop(over: Record<string, unknown> = {}) {
  return {
    requestId: "a1", dogName: "Luna", status: "done", requestedTime: "2026-10-25T14:00:00+00:00",
    pickupLat: 1.2136, pickupLng: -77.2811, legKm: 0.04, legMinutes: 1, legSource: "straight", ...over,
  };
}

function route(over: Record<string, unknown> = {}) {
  return {
    date: "2026-10-25", start: { lat: 1.214, lng: -77.2811 },
    stops: [stop(), stop({ requestId: "b2", dogName: "Max", status: "assigned", legKm: 1, legMinutes: 9, legSource: "graph" })],
    totalKm: 1.04, totalMinutes: 10, nextStopId: "b2", ...over,
  };
}

describe("Walker Rutas", () => {
  beforeEach(() => {
    cleanup();
    for (const mock of [mockRoute, mockDetail, mockGps, mockCheckIn, mockCheckOut, mockCancel, mockWalkingRoute]) {
      mock.mockReset();
    }
    // Unless a test says otherwise, the router has nothing to offer.
    mockWalkingRoute.mockResolvedValue({ source: "straight", distanceKm: 0.43, minutes: 6, geometry: [], steps: [] });
    mockRoute.mockResolvedValue(route());
  });

  async function renderRoutes() {
    const { WalkerRoutesScreen } = await import("../../apps/web/src/walker/WalkerRoutesScreen.js");
    const user = userEvent.setup();
    render(<WalkerRoutesScreen userId="walker-1" />);
    return user;
  }

  it("draws the stops in server order with legs, ticks and the next stop marked", async () => {
    await renderRoutes();

    const list = await screen.findByRole("list", { name: "Paradas" });
    const rows = within(list).getAllByRole("listitem").filter((item) => item.parentElement === list);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText(/✓/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText("0,0 km · 1 min (aprox.)")).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/●/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText("1,0 km · 9 min")).toBeInTheDocument();
    expect(screen.getByText(/2 paseos · 1,0 km · 10 min/)).toBeInTheDocument();
  });

  it("puts 'Tú' first on the map when he is online", async () => {
    await renderRoutes();
    const map = await screen.findByTestId("map");
    expect(map.getAttribute("data-labels")).toBe("Tú|1 · Luna|2 · Max");
  });

  it("shows a dash for the first leg and no 'Tú' pin when offline", async () => {
    mockRoute.mockResolvedValue(route({ start: null, stops: [stop({ legSource: "start", status: "assigned" })], nextStopId: "a1" }));
    await renderRoutes();

    expect(await screen.findByText("—")).toBeInTheDocument();
    expect((await screen.findByTestId("map")).getAttribute("data-labels")).toBe("1 · Luna");
  });

  it("changes the day with the arrows and asks for that date", async () => {
    const user = await renderRoutes();
    await screen.findByRole("list", { name: "Paradas" });
    await user.click(screen.getByRole("button", { name: "Día siguiente" }));

    await waitFor(() => expect(mockRoute).toHaveBeenCalledTimes(2));
    const [, date] = mockRoute.mock.calls[1]!;
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(date).not.toBe(mockRoute.mock.calls[0]![1]);
  });

  it("shows the empty state", async () => {
    mockRoute.mockResolvedValue(route({ stops: [], nextStopId: null, totalKm: 0, totalMinutes: 0 }));
    await renderRoutes();
    expect(await screen.findByText("No tienes paseos este día. Mira Solicitudes")).toBeInTheDocument();
  });

  it("opens the walk detail inside the stop card", async () => {
    mockDetail.mockResolvedValue({
      id: "a1", status: "done", dog: { id: "d", name: "Luna" }, walker: null,
      requestedTime: "2026-10-25T14:00:00+00:00", windowEnd: "x", durationHours: 1, priceCop: 17000,
      offerCount: 1, timeline: [{ kind: "check_in", at: "2026-10-25T14:02:00+00:00" }, { kind: "check_out", at: "2026-10-25T15:01:00+00:00" }],
      rating: 5, report: null, allowedActions: [],
    });
    const user = await renderRoutes();

    await user.click(await screen.findByRole("button", { name: "Abrir paseo de Luna" }));
    expect(await screen.findByText("Recogida")).toBeInTheDocument();
    expect(screen.getByText("Entrega")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar paseo de Luna" })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the next stop with directions, the owner's phone and starts the walk", async () => {
    mockRoute.mockResolvedValue(route({
      stops: [stop(), stop({ requestId: "b2", dogName: "Max", status: "assigned", legKm: 1, legMinutes: 9, legSource: "graph",
        pickupLat: 1.22, pickupLng: -77.29, ownerName: "Camila", ownerPhone: "3001234567", netCop: 15300, durationHours: 0.75 })],
    }));
    mockCheckIn.mockResolvedValue({ id: "b2", status: "in_walk", walkerId: "walker-1" });
    const user = await renderRoutes();

    const card = await screen.findByRole("region", { name: "Siguiente parada" });
    expect(within(card).getByText("Max")).toBeInTheDocument();
    expect(within(card).getByText("$15.300")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Cómo llegar a Max" })).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Llamar a Camila" })).toHaveAttribute("href", "tel:3001234567");

    await user.click(within(card).getByRole("button", { name: "Iniciar paseo de Max" }));
    await waitFor(() => expect(mockCheckIn).toHaveBeenCalledWith("b2"));
    expect(await screen.findByText(/Paseo con Max iniciado/)).toBeInTheDocument();
    expect(mockRoute).toHaveBeenCalledTimes(2);
  });

  it("runs the walk in progress with a timer and finishes it after confirming", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-25T16:20:00+00:00"));
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { watchPosition: () => 1, clearWatch: () => undefined },
    });
    mockRoute.mockResolvedValue(route({
      active: { requestId: "b2", dogName: "Max", requestedTime: "2026-10-25T16:00:00+00:00", durationHours: 0.75,
        startedAt: "2026-10-25T16:02:00+00:00", netCop: 15300, ownerName: "Camila", ownerPhone: null, pickupLat: 1.22, pickupLng: -77.29 },
    }));
    mockCheckOut.mockResolvedValue({ id: "b2", status: "done", walkerId: "walker-1" });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { WalkerRoutesScreen } = await import("../../apps/web/src/walker/WalkerRoutesScreen.js");
    render(<WalkerRoutesScreen userId="walker-1" />);

    const card = await screen.findByRole("region", { name: "Paseo en curso con Max" });
    expect(within(card).getByRole("timer")).toHaveAccessibleName("Llevas 18:00 de 45 minutos");
    await user.click(within(card).getByRole("button", { name: "Terminar paseo" }));
    expect(mockCheckOut).not.toHaveBeenCalled();
    await user.click(within(card).getByRole("button", { name: "Sí, terminar" }));
    await waitFor(() => expect(mockCheckOut).toHaveBeenCalledWith("b2"));
    expect(await screen.findByText("Paseo terminado · +$15.300 netos")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("lists late walks to start or cancel, and cancelling asks first", async () => {
    mockRoute.mockResolvedValue(route({
      overdue: [{ requestId: "old", dogName: "Luna", requestedTime: "2026-10-20T14:00:00+00:00", durationHours: 1 }],
    }));
    mockCancel.mockResolvedValue({ id: "old", status: "open", walkerId: null });
    const user = await renderRoutes();

    const card = await screen.findByRole("region", { name: "Paseos atrasados" });
    expect(within(card).getByRole("button", { name: "Iniciar ahora el paseo de Luna" })).toBeEnabled();
    await user.click(within(card).getByRole("button", { name: "Cancelar el paseo de Luna" }));
    expect(mockCancel).not.toHaveBeenCalled();
    await user.click(within(card).getByRole("button", { name: "Sí, cancelar" }));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("old"));
    expect(await screen.findByText(/Cancelaste el paseo de Luna/)).toBeInTheDocument();
  });

  it("guides to the pickup on its own map and starts the walk from there", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (ok: (p: unknown) => void) => {
          ok({ coords: { latitude: 1.2105, longitude: -77.2792 } });
          return 7;
        },
        clearWatch: () => undefined,
      },
    });
    mockRoute.mockResolvedValue(route({
      stops: [stop({ requestId: "b2", dogName: "Max", status: "assigned", pickupLat: 1.2102, pickupLng: -77.2788,
        ownerName: "Camila", ownerPhone: "3001234567", netCop: 16200, durationHours: 0.75 })],
      nextStopId: "b2",
    }));
    mockCheckIn.mockResolvedValue({ id: "b2", status: "in_walk", walkerId: "walker-1" });
    const user = await renderRoutes();

    await user.click(await screen.findByRole("button", { name: "Cómo llegar a Max" }));
    const nav = await screen.findByRole("region", { name: "Cómo llegar a Max" });
    // 1.2105,-77.2792 to 1.2102,-77.2788 is about 50 m on foot.
    expect(within(nav).getByRole("status")).toHaveTextContent(/^\d+ m · \d+ min$/);
    expect(within(nav).getByText(/Camina al sureste hasta la recogida de Max/)).toBeInTheDocument();
    expect(within(nav).getByTestId("map").getAttribute("data-labels")).toBe("Tú|Recogida · Max");
    expect(within(nav).queryByRole("link", { name: /Google|Waze/ })).not.toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "Iniciar paseo de Max" }));
    await waitFor(() => expect(mockCheckIn).toHaveBeenCalledWith("b2"));
    expect(await screen.findByText(/Paseo con Max iniciado/)).toBeInTheDocument();
  });

  it("walks him turn by turn along the streets", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (ok: (p: unknown) => void) => {
          ok({ coords: { latitude: 1.2136, longitude: -77.2811 } });
          return 8;
        },
        clearWatch: () => undefined,
      },
    });
    mockWalkingRoute.mockResolvedValue({
      source: "osrm",
      distanceKm: 0.43,
      minutes: 6,
      geometry: [[1.2136, -77.2811], [1.2125, -77.28], [1.2102, -77.2788]],
      steps: [
        { text: "Empieza a caminar por Calle 16", distanceM: 180, startIndex: 0 },
        { text: "Gira a la derecha en Carrera 22", distanceM: 250, startIndex: 1 },
      ],
    });
    mockRoute.mockResolvedValue(route({
      stops: [stop({ requestId: "b2", dogName: "Max", status: "assigned", pickupLat: 1.2102, pickupLng: -77.2788 })],
      nextStopId: "b2",
    }));
    const user = await renderRoutes();

    await user.click(await screen.findByRole("button", { name: "Cómo llegar a Max" }));
    const nav = await screen.findByRole("region", { name: "Cómo llegar a Max" });
    await waitFor(() => expect(mockWalkingRoute).toHaveBeenCalledWith(
      "walker-1",
      { lat: 1.2136, lng: -77.2811 },
      { lat: 1.2102, lng: -77.2788 },
    ));

    // The turn he is walking towards, not the one he is already on.
    await waitFor(() => expect(within(nav).getByRole("status")).toHaveTextContent("Gira a la derecha en Carrera 22"));
    expect(within(nav).getByText(/^En \d+ m · faltan \d+ m · \d+ min$/)).toBeInTheDocument();

    const turns = within(nav).getByRole("list", { name: "Indicaciones" });
    expect(within(turns).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Empieza a caminar por Calle 16180 m",
      "Gira a la derecha en Carrera 22250 m",
    ]);
    expect(within(turns).getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step");
    // The drawn line follows the streets, not the pins.
    expect(within(nav).getByTestId("map")).toHaveAttribute("data-path", "3");
  });

  it("falls back to the direct line when the street router has nothing", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (ok: (p: unknown) => void) => {
          ok({ coords: { latitude: 1.2136, longitude: -77.2811 } });
          return 9;
        },
        clearWatch: () => undefined,
      },
    });
    mockWalkingRoute.mockRejectedValue(new Error("offline"));
    mockRoute.mockResolvedValue(route({
      stops: [stop({ requestId: "b2", dogName: "Max", status: "assigned", pickupLat: 1.2102, pickupLng: -77.2788 })],
      nextStopId: "b2",
    }));
    const user = await renderRoutes();

    await user.click(await screen.findByRole("button", { name: "Cómo llegar a Max" }));
    const nav = await screen.findByRole("region", { name: "Cómo llegar a Max" });
    expect(within(nav).getByRole("status")).toHaveTextContent(/^\d+ m · \d+ min$/);
    expect(within(nav).getByText(/Camina al sureste hasta la recogida de Max/)).toBeInTheDocument();
    expect(within(nav).queryByRole("list", { name: "Indicaciones" })).not.toBeInTheDocument();
  });

  it("offers the way to a late walk too", async () => {
    mockRoute.mockResolvedValue(route({
      stops: [],
      nextStopId: null,
      overdue: [{ requestId: "old", dogName: "Luna", requestedTime: "2026-10-20T14:00:00+00:00", durationHours: 1,
        pickupLat: 1.215, pickupLng: -77.282 }],
    }));
    const user = await renderRoutes();

    await user.click(await screen.findByRole("button", { name: "Cómo llegar a Luna" }));
    expect(await screen.findByRole("region", { name: "Cómo llegar a Luna" })).toBeInTheDocument();
  });

  it("says to turn the location on when the browser will not give it", async () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    mockRoute.mockResolvedValue(route({
      stops: [stop({ requestId: "b2", dogName: "Max", status: "assigned" })], nextStopId: "b2",
    }));
    const user = await renderRoutes();

    await user.click(await screen.findByRole("button", { name: "Cómo llegar a Max" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Activa la ubicación del navegador para guiarte hasta la recogida.");
    await user.click(screen.getByRole("button", { name: "← Volver a la ruta" }));
    expect(await screen.findByRole("region", { name: "Siguiente parada" })).toBeInTheDocument();
  });

  it("runs a whole demo day in preview without calling the API", async () => {
    const { WalkerRoutesScreen } = await import("../../apps/web/src/walker/WalkerRoutesScreen.js");
    const user = userEvent.setup();
    render(<WalkerRoutesScreen userId="preview-walker" preview />);

    const next = await screen.findByRole("region", { name: "Siguiente parada" });
    await user.click(within(next).getByRole("button", { name: "Iniciar paseo de Max" }));
    const active = await screen.findByRole("region", { name: "Paseo en curso con Max" });
    await user.click(within(active).getByRole("button", { name: "Terminar paseo" }));
    await user.click(within(active).getByRole("button", { name: "Sí, terminar" }));
    expect(await screen.findByText("Paseo terminado · +$16.200 netos")).toBeInTheDocument();
    expect(within(await screen.findByRole("region", { name: "Siguiente parada" })).getByText("Kira")).toBeInTheDocument();

    const late = screen.getByRole("region", { name: "Paseos atrasados" });
    await user.click(within(late).getByRole("button", { name: "Cancelar el paseo de Luna" }));
    await user.click(within(late).getByRole("button", { name: "Sí, cancelar" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Paseos atrasados" })).not.toBeInTheDocument());

    expect(mockRoute).not.toHaveBeenCalled();
    expect(mockCheckIn).not.toHaveBeenCalled();
    expect(mockCheckOut).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("explains when there are no cancellations left", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockRoute.mockResolvedValue(route({
      overdue: [{ requestId: "old", dogName: "Luna", requestedTime: "2026-10-20T14:00:00+00:00", durationHours: 1 }],
    }));
    mockCancel.mockRejectedValue(new ApiError("No cancellation tokens left.", 403));
    const user = await renderRoutes();

    await user.click(await screen.findByRole("button", { name: "Cancelar el paseo de Luna" }));
    await user.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya no te quedan cancelaciones disponibles.");
  });
});

describe("Walker Clientes", () => {
  beforeEach(() => {
    cleanup();
    mockClients.mockReset();
    mockClient.mockReset();
    mockSaveNote.mockReset();
  });

  async function renderClients(props: Record<string, unknown> = {}) {
    const { WalkerClientsScreen } = await import("../../apps/web/src/walker/WalkerClientsScreen.js");
    const user = userEvent.setup();
    render(<WalkerClientsScreen userId="walker-1" {...props} />);
    return user;
  }

  /** One owner in the list, with only the fields a test cares about. */
  function client(over: Record<string, unknown> = {}) {
    return {
      ownerId: "o1", ownerName: "Camila", dogs: [{ id: "d1", name: "Luna" }],
      walksDone: 1, upcoming: 0, lastWalkAt: null, nextWalkAt: null, grossCop: 15000, ...over,
    };
  }

  it("lists the clients with dogs, walks and what he earned", async () => {
    mockClients.mockResolvedValue([
      client({ ownerName: null, dogs: [{ id: "d1", name: "Luna" }, { id: "d2", name: "Max" }], walksDone: 7,
        lastWalkAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), grossCop: 105000 }),
    ]);
    await renderClients();

    expect(await screen.findByText("Dueño")).toBeInTheDocument();
    expect(screen.getByText("Luna")).toBeInTheDocument();
    expect(screen.getByText("Max")).toBeInTheDocument();
    expect(screen.getByText("7 paseos")).toBeInTheDocument();
    expect(screen.getByText("último hace 3 días")).toBeInTheDocument();
    expect(screen.getByText("$105.000")).toBeInTheDocument();
    expect(screen.getByText("Cliente frecuente")).toBeInTheDocument();
    expect(screen.getByText("1 cliente · 7 paseos · $105.000")).toBeInTheDocument();
  });

  it("marks only the owners who come back often", async () => {
    mockClients.mockResolvedValue([
      client({ ownerId: "o1", ownerName: "Camila", walksDone: 5 }),
      client({ ownerId: "o2", ownerName: "Andrés", walksDone: 4 }),
    ]);
    await renderClients();

    const rows = await screen.findAllByRole("listitem");
    const camila = rows.find((row) => row.textContent?.includes("Camila"))!;
    const andres = rows.find((row) => row.textContent?.includes("Andrés"))!;
    expect(within(camila).getByText("Cliente frecuente")).toBeInTheDocument();
    expect(within(andres).queryByText("Cliente frecuente")).not.toBeInTheDocument();
  });

  it("offers the search and the order only once the list is long", async () => {
    mockClients.mockResolvedValue([client(), client({ ownerId: "o2", ownerName: "Andrés" })]);
    await renderClients();
    await screen.findByRole("button", { name: "Abrir cliente Camila" });
    expect(screen.queryByRole("searchbox", { name: "Buscar dueño o perro" })).not.toBeInTheDocument();
  });

  it("searches by owner and by dog, and orders by who is coming", async () => {
    mockClients.mockResolvedValue([
      client({ ownerId: "o1", ownerName: "Camila", dogs: [{ id: "d1", name: "Luna" }], walksDone: 9 }),
      client({ ownerId: "o2", ownerName: "Andrés", dogs: [{ id: "d2", name: "Toby" }],
        nextWalkAt: "2026-11-14T13:00:00+00:00" }),
      client({ ownerId: "o3", ownerName: "Sofía", dogs: [{ id: "d3", name: "Nube" }] }),
      client({ ownerId: "o4", ownerName: "Diego", dogs: [{ id: "d4", name: "Coco" }] }),
    ]);
    const user = await renderClients();

    const search = await screen.findByRole("searchbox", { name: "Buscar dueño o perro" });
    await user.type(search, "toby");
    expect(screen.getByRole("button", { name: "Abrir cliente Andrés" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir cliente Camila" })).not.toBeInTheDocument();

    await user.clear(search);
    await user.click(screen.getByRole("button", { name: "Más paseos" }));
    let names = screen.getAllByRole("button", { name: /^Abrir cliente/ }).map((b) => b.getAttribute("aria-label"));
    expect(names[0]).toBe("Abrir cliente Camila");

    await user.click(screen.getByRole("button", { name: "Por venir" }));
    names = screen.getAllByRole("button", { name: /^Abrir cliente/ }).map((b) => b.getAttribute("aria-label"));
    expect(names[0]).toBe("Abrir cliente Andrés");
  });

  it("explains the empty list", async () => {
    mockClients.mockResolvedValue([]);
    await renderClients();
    expect(await screen.findByText("Cuando ganes tu primer paseo, tus clientes aparecen aquí")).toBeInTheDocument();
  });

  /** A client file with a live walk: everything the walker may see. */
  function detail(over: Record<string, unknown> = {}) {
    return {
      ownerId: "o1", ownerName: "Camila", ownerAvatarUrl: null, phone: "+57 300 123 4567",
      walksDone: 1, upcoming: 1, lastWalkAt: null, nextWalkAt: "2026-10-28T22:00:00+00:00", grossCop: 15000,
      care: {
        pickupNotes: "Portería, torre 3.", handoff: "doorman", emergencyName: "Laura",
        emergencyRelation: "Hermana", emergencyPhone: "+57 311 000 1111",
        vetName: "Clínica Pasto", vetPhone: "7230000",
      },
      dogs: [{
        id: "d1", name: "Luna", breed: "Labrador", notes: "Mayor, camina despacio.", note: null,
        profile: { size: "medium", temperament: "friendly", energy: "high", leashTrained: true,
          allergies: "pollo", medicalNotes: null, vetContact: null, emergencyContact: null },
      }],
      walks: [{ id: "w1", dogName: "Luna", status: "assigned",
        requestedTime: "2026-10-28T22:00:00+00:00", priceCop: 15000, rating: null }],
      ...over,
    };
  }

  it("shows care notes first and a Llamar link only when the phone is released", async () => {
    mockClients.mockResolvedValue([client({ upcoming: 1 })]);
    mockClient.mockResolvedValue(detail());
    const user = await renderClients();

    await user.click(await screen.findByRole("button", { name: "Abrir cliente Camila" }));
    expect(await screen.findByRole("link", { name: "Llamar a Camila" })).toHaveAttribute("href", "tel:+573001234567");
    const notes = screen.getByRole("region", { name: "Cuidados de Luna" });
    expect(within(notes).getByText("Alergias: pollo")).toBeInTheDocument();
    expect(within(notes).getByText("Labrador")).toBeInTheDocument();
    expect(within(notes).getByText("Mayor, camina despacio.")).toBeInTheDocument();
  });

  it("gives him the door-step details only while a walk is live", async () => {
    mockClients.mockResolvedValue([client({ upcoming: 1 })]);
    mockClient.mockResolvedValue(detail());
    const user = await renderClients();

    await user.click(await screen.findByRole("button", { name: "Abrir cliente Camila" }));
    const door = await screen.findByRole("region", { name: "Cómo recibir al perro" });
    expect(within(door).getByText("Portería, torre 3.")).toBeInTheDocument();
    expect(within(door).getByText("Lo recibes en portería")).toBeInTheDocument();
    expect(within(door).getByRole("link", { name: "Llamar a Laura" })).toHaveAttribute("href", "tel:+573110001111");
    expect(within(door).getByRole("link", { name: "Llamar al veterinario" })).toHaveAttribute("href", "tel:7230000");
  });

  it("explains the door-step details are locked when no walk is live", async () => {
    mockClients.mockResolvedValue([client()]);
    mockClient.mockResolvedValue(detail({ care: null, phone: null, upcoming: 0, nextWalkAt: null }));
    const user = await renderClients();

    await user.click(await screen.findByRole("button", { name: "Abrir cliente Camila" }));
    const door = await screen.findByRole("region", { name: "Cómo recibir al perro" });
    expect(within(door).getByText(/se habilitan cuando tengas un paseo con este cliente/)).toBeInTheDocument();
    expect(within(door).queryByRole("link")).not.toBeInTheDocument();
  });

  it("saves his private note on a dog and keeps it on screen", async () => {
    mockClients.mockResolvedValue([client({ upcoming: 1 })]);
    mockClient.mockResolvedValue(detail());
    mockSaveNote.mockResolvedValue({ note: "Le gusta el parque Infantil." });
    const user = await renderClients();

    await user.click(await screen.findByRole("button", { name: "Abrir cliente Camila" }));
    const field = await screen.findByRole("textbox", { name: "Tus notas sobre Luna" });
    expect(screen.getByRole("button", { name: "Guardar tus notas sobre Luna" })).toBeDisabled();

    await user.type(field, "Le gusta el parque Infantil.");
    await user.click(screen.getByRole("button", { name: "Guardar tus notas sobre Luna" }));
    await waitFor(() =>
      expect(mockSaveNote).toHaveBeenCalledWith("walker-1", "o1", "d1", "Le gusta el parque Infantil."),
    );
    expect(await screen.findByText("Guardado")).toBeInTheDocument();
  });

  it("shows the stars the owner left on a finished walk", async () => {
    mockClients.mockResolvedValue([client()]);
    mockClient.mockResolvedValue(detail({
      walks: [{ id: "w1", dogName: "Luna", status: "done",
        requestedTime: "2026-10-20T22:00:00+00:00", priceCop: 15000, rating: 5 }],
    }));
    const user = await renderClients();

    await user.click(await screen.findByRole("button", { name: "Abrir cliente Camila" }));
    const walks = await screen.findByRole("region", { name: "Paseos" });
    expect(within(walks).getByLabelText("5 de 5 estrellas")).toBeInTheDocument();
    expect(within(walks).getByText("Terminado")).toBeInTheDocument();
  });

  it("hides the phone while no walk is assigned", async () => {
    mockClients.mockResolvedValue([client({ dogs: [], grossCop: 0 })]);
    mockClient.mockResolvedValue(detail({ phone: null, care: null, upcoming: 0, nextWalkAt: null, dogs: [], walks: [] }));
    const user = await renderClients();

    await user.click(await screen.findByRole("button", { name: "Abrir cliente Camila" }));
    expect(await screen.findByText("El contacto se habilita cuando tengas un paseo asignado")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Llamar a Camila$/ })).not.toBeInTheDocument();
  });

  it("goes back to the list on a 404", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockClients.mockResolvedValue([client({ dogs: [], grossCop: 0 })]);
    mockClient.mockRejectedValue(new ApiError("Not one of your clients.", 404));
    const user = await renderClients();

    await user.click(await screen.findByRole("button", { name: "Abrir cliente Camila" }));
    expect(await screen.findByRole("heading", { name: "Clientes" })).toBeInTheDocument();
  });
});

describe("Walker Perfil", () => {
  function profile(over: Record<string, unknown> = {}) {
    return {
      walkerId: "walker-1", email: "mateo@gmail.com", displayName: "Mateo", bio: null, serviceArea: "Centro",
      pricePerWalk: 15000, phone: null, avatarUrl: null, consent: { version: "2026-10", at: "2026-10-25T15:00:00+00:00" },
      stats: { walksDone: 3, rating: { average: 4.5, count: 2 } }, ...over,
    };
  }

  beforeEach(() => {
    cleanup();
    for (const mock of [mockProfile, mockSave, mockAvatar, mockConsent, mockWalks]) mock.mockReset();
    mockProfile.mockResolvedValue(profile());
    mockWalks.mockResolvedValue([{ id: "w1", dogName: "Luna", ownerName: "Camila", status: "done", requestedTime: "2026-10-20T15:00:00+00:00", durationHours: 1, priceCop: 17000, rating: 4.5 }]);
  });

  async function renderProfile() {
    const { WalkerProfileScreen } = await import("../../apps/web/src/walker/WalkerProfileScreen.js");
    const user = userEvent.setup();
    render(<WalkerProfileScreen userId="walker-1" onSignOut={vi.fn()} />);
    await screen.findByRole("heading", { name: "Perfil" });
    return user;
  }

  it("shows the profile, the rating and the past walks with their rating", async () => {
    await renderProfile();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Mateo");
    expect(screen.getByText(/mateo@gmail.com · ★ 4.5 \(2\)/)).toBeInTheDocument();
    expect(await screen.findByText(/\$17\.000 · ★ 4\.5/)).toBeInTheDocument();
    expect(mockWalks).toHaveBeenCalledWith("walker-1", "past");
  });

  it("validates displayName and pricePerWalk with the brief's limits", async () => {
    const user = await renderProfile();
    await user.clear(screen.getByLabelText("Nombre"));
    await user.clear(screen.getByLabelText("Precio por paseo (COP)"));
    await user.type(screen.getByLabelText("Precio por paseo (COP)"), "2000000");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Escribe tu nombre (máx. 80)")).toBeInTheDocument();
    expect(screen.getByText("El precio por paseo debe estar entre $0 y $1.000.000")).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("saves the whole form, and sends the consent right after the first save", async () => {
    mockProfile.mockResolvedValue(profile({ displayName: null, pricePerWalk: null, consent: null }));
    mockSave.mockResolvedValue(profile({ consent: null }));
    mockConsent.mockResolvedValue({ version: "2026-10", at: "2026-10-27T10:00:00+00:00" });
    const user = await renderProfile();

    expect(screen.getByText("Completa tu perfil para recibir solicitudes")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nombre"), "Mateo");
    await user.type(screen.getByLabelText("Precio por paseo (COP)"), "15000");
    await user.click(screen.getByLabelText("Acepto la política de tratamiento de datos"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith("walker-1", { displayName: "Mateo", bio: null, serviceArea: "Centro", pricePerWalk: 15000, phone: null, experienceYears: null, dogSizes: [] }),
    );
    await waitFor(() => expect(mockConsent).toHaveBeenCalledWith("walker-1"));
  });

  it("tells him to save the profile first when the avatar answers 409", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockAvatar.mockRejectedValue(new ApiError("Save your profile before adding a photo.", 409));
    const user = await renderProfile();

    await user.upload(screen.getByLabelText("Cambiar foto"), new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByText("Guarda tu perfil primero")).toBeInTheDocument();
  });

  it("sends his experience and the sizes he takes, in a fixed order", async () => {
    mockSave.mockResolvedValue(profile({ experienceYears: 2, dogSizes: ["small", "large"] }));
    const user = await renderProfile();

    await user.type(screen.getByLabelText("Años de experiencia"), "2");
    await user.click(screen.getByRole("button", { name: "Grandes" }));
    await user.click(screen.getByRole("button", { name: "Pequeños" }));
    expect(screen.getByRole("button", { name: "Grandes" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith("walker-1", expect.objectContaining({ experienceYears: 2, dogSizes: ["small", "large"] })),
    );
  });

  it("refuses an experience outside 0 to 50 years", async () => {
    const user = await renderProfile();
    await user.type(screen.getByLabelText("Años de experiencia"), "80");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText("La experiencia va de 0 a 50 años")).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("previews the offer card owners see while he types", async () => {
    const user = await renderProfile();
    const card = within(screen.getByRole("region", { name: "Así te ven los dueños" }));
    expect(card.getByText("Mateo")).toBeInTheDocument();
    expect(card.getByText("★ 4.5 (2) · 3 paseos hechos")).toBeInTheDocument();
    expect(card.getByText("$15.000")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Sobre ti"), "Paseo perros grandes por el Centro.");
    await user.click(screen.getByRole("button", { name: "Medianos" }));
    expect(card.getByText("Paseo perros grandes por el Centro.")).toBeInTheDocument();
    expect(card.getByText("Perros medianos")).toBeInTheDocument();
    expect(card.getByText("Centro")).toBeInTheDocument();
  });

  it("measures how complete the profile is and names what is missing", async () => {
    await renderProfile();
    const meter = screen.getByRole("progressbar", { name: "Perfil completo" });
    // Name, price, area and consent are there: 4 of 9.
    expect(meter).toHaveAttribute("aria-valuenow", "44");
    expect(screen.getByText(/Te falta: Una foto tuya, Unas líneas sobre ti, Tu experiencia/)).toBeInTheDocument();
  });

  it("shows hours, clients, the star spread and the latest ratings", async () => {
    mockProfile.mockResolvedValue(profile({
      stats: { walksDone: 7, hoursWalked: 8.5, clients: 2, rating: { average: 4.75, count: 4, breakdown: [0, 0, 0, 1, 3] } },
      reviews: [{ rating: 5, at: "2026-11-02T15:00:00+00:00", dogName: "Nube", ownerName: "Camila" }],
    }));
    await renderProfile();

    const stats = within(screen.getByRole("region", { name: "Tu perfil" }));
    expect(stats.getByText("8,5")).toBeInTheDocument();
    expect(stats.getByText("Muy bien calificado")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "5 estrellas: 3" })).toBeInTheDocument();
    const latest = within(screen.getByRole("list", { name: "Últimas calificaciones" }));
    expect(latest.getByText("Nube · Camila")).toBeInTheDocument();
    expect(latest.getByText("2 nov 2026")).toBeInTheDocument();
    expect(latest.getByRole("img", { name: "5 de 5 estrellas" })).toBeInTheDocument();
  });

  it("explains the empty ratings", async () => {
    mockProfile.mockResolvedValue(profile({ stats: { walksDone: 0, rating: { average: null, count: 0 } } }));
    await renderProfile();
    expect(screen.getByText("Cuando un dueño califique un paseo, sus estrellas aparecen aquí.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Tu perfil" })).getByText("Nuevo en CanTrack")).toBeInTheDocument();
  });

  it("offers Reintentar when the profile does not load", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockProfile.mockRejectedValueOnce(new ApiError("boom", 500)).mockResolvedValue(profile());
    const { WalkerProfileScreen } = await import("../../apps/web/src/walker/WalkerProfileScreen.js");
    const user = userEvent.setup();
    render(<WalkerProfileScreen userId="walker-1" onSignOut={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Perfil" })).toBeInTheDocument();
  });

  it("maps a 413 on the avatar", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockAvatar.mockRejectedValue(new ApiError("The avatar must be 2 MB or less.", 413));
    const user = await renderProfile();

    await user.upload(screen.getByLabelText("Cambiar foto"), new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByText("La foto debe pesar máximo 2 MB")).toBeInTheDocument();
  });
});
