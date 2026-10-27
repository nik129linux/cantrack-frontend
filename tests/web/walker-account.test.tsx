// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Walker Rutas, Clientes and Perfil (walker-rutas.md, walker-clientes.md,
// walker-perfil.md): everything is drawn from the server's answer.

vi.mock("../../apps/web/src/lib/supabase.js", () => ({ supabase: { auth: {} } }));
vi.mock("../../apps/web/src/map/MarkersMap.js", () => ({
  MarkersMap: ({ label, markers }: { label: string; markers: { label: string }[] }) => (
    <div data-testid="map" aria-label={label} data-labels={markers.map((m) => m.label).join("|")} />
  ),
}));

const mockRoute = vi.fn();
const mockDetail = vi.fn();
const mockGps = vi.fn();
const mockClients = vi.fn();
const mockClient = vi.fn();
const mockProfile = vi.fn();
const mockSave = vi.fn();
const mockAvatar = vi.fn();
const mockConsent = vi.fn();
const mockWalks = vi.fn();

vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchDayRoute: mockRoute,
  fetchWalkDetail: mockDetail,
  sendGpsPoints: mockGps,
  fetchClientList: mockClients,
  fetchClientDetail: mockClient,
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
    for (const mock of [mockRoute, mockDetail, mockGps]) mock.mockReset();
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
    const rows = within(list).getAllByRole("listitem");
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

  it("opens the walk detail and offers to share the location only when send_gps is allowed", async () => {
    mockDetail.mockResolvedValue({
      id: "b2", status: "in_walk", dog: { id: "d", name: "Max" }, walker: null,
      requestedTime: "2026-10-25T16:00:00+00:00", windowEnd: "x", durationHours: 1, priceCop: 17000,
      offerCount: 1, timeline: [{ kind: "check_in", at: "2026-10-25T16:02:00+00:00" }],
      rating: null, report: null, allowedActions: ["send_gps", "check_out"],
    });
    const user = await renderRoutes();

    await user.click(await screen.findByRole("button", { name: "Abrir paseo de Max" }));
    expect(await screen.findByRole("button", { name: "Compartir mi ubicación" })).toBeInTheDocument();
    expect(screen.getByText("Recogida")).toBeInTheDocument();
  });
});

describe("Walker Clientes", () => {
  beforeEach(() => {
    cleanup();
    mockClients.mockReset();
    mockClient.mockReset();
  });

  async function renderClients() {
    const { WalkerClientsScreen } = await import("../../apps/web/src/walker/WalkerClientsScreen.js");
    const user = userEvent.setup();
    render(<WalkerClientsScreen userId="walker-1" />);
    return user;
  }

  it("lists the clients with dogs, walks and what he earned", async () => {
    mockClients.mockResolvedValue([
      { ownerId: "o1", ownerName: null, dogs: [{ id: "d1", name: "Luna" }, { id: "d2", name: "Max" }], walksDone: 7, upcoming: 0, lastWalkAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), grossCop: 105000 },
    ]);
    await renderClients();

    expect(await screen.findByText("Dueño · Luna, Max")).toBeInTheDocument();
    expect(screen.getByText("7 paseos · último hace 3 días")).toBeInTheDocument();
    expect(screen.getByText("$105.000")).toBeInTheDocument();
  });

  it("explains the empty list", async () => {
    mockClients.mockResolvedValue([]);
    await renderClients();
    expect(await screen.findByText("Cuando ganes tu primer paseo, tus clientes aparecen aquí")).toBeInTheDocument();
  });

  it("shows care notes first and a Llamar link only when the phone is released", async () => {
    mockClients.mockResolvedValue([{ ownerId: "o1", ownerName: "Camila", dogs: [{ id: "d1", name: "Luna" }], walksDone: 1, upcoming: 1, lastWalkAt: null, grossCop: 15000 }]);
    mockClient.mockResolvedValue({
      ownerId: "o1", ownerName: "Camila", phone: "+57 300 123 4567", walksDone: 1, upcoming: 1, lastWalkAt: null, grossCop: 15000,
      dogs: [{ id: "d1", name: "Luna", profile: { size: "mediano", temperament: "dócil", energy: "alta", leashTrained: true, allergies: "pollo", medicalNotes: null, vetContact: null, emergencyContact: null } }],
      walks: [{ id: "w1", dogName: "Luna", status: "assigned", requestedTime: "2026-10-28T22:00:00+00:00", priceCop: 15000 }],
    });
    const user = await renderClients();

    await user.click(await screen.findByRole("button", { name: "Abrir cliente Camila" }));
    expect(await screen.findByRole("link", { name: "Llamar" })).toHaveAttribute("href", "tel:+573001234567");
    const notes = screen.getByRole("region", { name: "Cuidados de Luna" });
    expect(within(notes).getByText("Alergias: pollo")).toBeInTheDocument();
  });

  it("hides the phone while no walk is assigned", async () => {
    mockClients.mockResolvedValue([{ ownerId: "o1", ownerName: "Camila", dogs: [], walksDone: 1, upcoming: 0, lastWalkAt: null, grossCop: 0 }]);
    mockClient.mockResolvedValue({ ownerId: "o1", ownerName: "Camila", phone: null, walksDone: 1, upcoming: 0, lastWalkAt: null, grossCop: 0, dogs: [], walks: [] });
    const user = await renderClients();

    await user.click(await screen.findByRole("button", { name: "Abrir cliente Camila" }));
    expect(await screen.findByText("El contacto se habilita cuando tengas un paseo asignado")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Llamar" })).not.toBeInTheDocument();
  });

  it("goes back to the list on a 404", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockClients.mockResolvedValue([{ ownerId: "o1", ownerName: "Camila", dogs: [], walksDone: 1, upcoming: 0, lastWalkAt: null, grossCop: 0 }]);
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
    expect(screen.getByText(/★ 4.5 \(2\)/)).toBeInTheDocument();
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
      expect(mockSave).toHaveBeenCalledWith("walker-1", { displayName: "Mateo", bio: null, serviceArea: "Centro", pricePerWalk: 15000, phone: null }),
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

  it("maps a 413 on the avatar", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockAvatar.mockRejectedValue(new ApiError("The avatar must be 2 MB or less.", 413));
    const user = await renderProfile();

    await user.upload(screen.getByLabelText("Cambiar foto"), new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByText("La foto debe pesar máximo 2 MB")).toBeInTheDocument();
  });
});
