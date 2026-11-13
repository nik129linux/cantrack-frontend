// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mis paseos (owner), on liquid glass: month summary and tab counters from
// /walks/summary, the featured walk, tabs with cursor, cards grouped by day,
// a dog filter, and the detail that draws buttons ONLY from allowedActions,
// with the live map polled every 10 s until a 409 stops it.

const mockWalks = vi.fn();
const mockSummary = vi.fn();
const mockDetail = vi.fn();
const mockLive = vi.fn();
const mockCancel = vi.fn();
const mockNoShow = vi.fn();
const mockRate = vi.fn();
const mockRepeat = vi.fn();
const mockReplay = vi.fn();

vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchOwnerWalks: mockWalks,
  fetchWalkSummary: mockSummary,
  fetchWalkDetail: mockDetail,
  fetchLiveWalk: mockLive,
  cancelWalk: mockCancel,
  reportNoShow: mockNoShow,
  rateWalk: mockRate,
  repeatWalk: mockRepeat,
  fetchReplay: mockReplay,
}));

vi.mock("../../apps/web/src/map/MarkersMap.js", () => ({
  MarkersMap: ({ label, markers }: { label: string; markers: unknown[] }) => (
    <div data-testid="map" aria-label={label} data-markers={markers.length} />
  ),
}));

// Far in the future so an "assigned" walk is never shown as stale.
const START = "2099-01-02T22:00:00+00:00";

function walk(over: Record<string, unknown> = {}) {
  return {
    id: "w1",
    status: "assigned",
    dogId: "d1",
    dogName: "Luna",
    walkerId: "m1",
    walkerName: "Mateo",
    requestedTime: START,
    durationHours: 0.75,
    priceCop: 15000,
    canRate: false,
    hasReport: false,
    ...over,
  };
}

function detail(over: Record<string, unknown> = {}) {
  return {
    id: "w1",
    status: "assigned",
    dog: { id: "d1", name: "Luna" },
    walker: { id: "m1", name: "Mateo", allTimeRating: 4.8, ratingCount: 23 },
    requestedTime: START,
    windowEnd: "2099-01-02T23:00:00+00:00",
    durationHours: 0.75,
    priceCop: 15000,
    offerCount: 3,
    timeline: [],
    rating: null,
    report: null,
    allowedActions: ["cancel"],
    ...over,
  };
}

function summary(over: Record<string, unknown> = {}) {
  return {
    month: { walks: 0, km: 0, minutes: 0 },
    counts: { upcoming: 0, active: 0, past: 0 },
    ...over,
  };
}

async function renderScreen(props: Record<string, unknown> = {}) {
  const { OwnerWalksScreen } = await import("../../apps/web/src/owner/OwnerWalksScreen.js");
  const user = userEvent.setup();
  render(<OwnerWalksScreen userId="owner-1" {...props} />);
  return user;
}

async function openLuna(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Abrir paseo de Luna" }));
}

describe("Owner Mis paseos", () => {
  beforeEach(() => {
    cleanup();
    for (const mock of [mockWalks, mockSummary, mockDetail, mockLive, mockCancel, mockNoShow, mockRate, mockRepeat, mockReplay]) {
      mock.mockReset();
    }
    mockWalks.mockResolvedValue({ items: [walk()], nextCursor: null });
    // No counters by default, so the featured card makes no extra list call.
    mockSummary.mockResolvedValue(summary());
  });

  afterEach(() => vi.useRealTimers());

  it("lists the upcoming walks and loads the other tabs on demand", async () => {
    const user = await renderScreen();

    const card = await screen.findByRole("button", { name: "Abrir paseo de Luna" });
    expect(within(card).getByText("Programado")).toBeInTheDocument();
    expect(mockWalks).toHaveBeenCalledWith("owner-1", "upcoming", undefined);

    mockWalks.mockResolvedValueOnce({
      items: [walk({ id: "w9", status: "done", canRate: true, hasReport: true, distanceKm: 3.2, durationMin: 62 })],
      nextCursor: null,
    });
    await user.click(screen.getByRole("tab", { name: /Pasados/ }));

    const done = await screen.findByRole("button", { name: "Abrir paseo de Luna" });
    expect(await within(done).findByText("Terminado")).toBeInTheDocument();
    expect(within(done).getByText("★ Calificar")).toBeInTheDocument();
    expect(within(done).getByText("📸 Reporte listo")).toBeInTheDocument();
    expect(within(done).getByText("🐾 3,2 km")).toBeInTheDocument();
    expect(mockWalks).toHaveBeenLastCalledWith("owner-1", "past", undefined);
  });

  it("shows the month summary and the tab counters", async () => {
    mockSummary.mockResolvedValue(summary({ month: { walks: 3, km: 4.2, minutes: 150 }, counts: { upcoming: 0, active: 0, past: 4 } }));
    await renderScreen();

    expect(await screen.findByText("Este mes: 3 paseos · 4,2 km · 2 h 30 min al aire libre")).toBeInTheDocument();
    expect(within(screen.getByRole("tab", { name: /Pasados/ })).getByText("4")).toBeInTheDocument();
  });

  it("features the next walk and opens it", async () => {
    mockSummary.mockResolvedValue(summary({ counts: { upcoming: 1, active: 0, past: 0 } }));
    mockDetail.mockResolvedValue(detail());
    const user = await renderScreen();

    const featured = await screen.findByRole("button", { name: /PRÓXIMO PASEO/ });
    await user.click(featured);
    expect(await screen.findByRole("heading", { name: "Paseo de Luna" })).toBeInTheDocument();
  });

  it("filters by dog when the list has more than one", async () => {
    mockWalks.mockResolvedValue({
      items: [walk(), walk({ id: "w2", dogId: "d2", dogName: "Toby" })],
      nextCursor: null,
    });
    const user = await renderScreen();

    await screen.findByRole("button", { name: "Abrir paseo de Toby" });
    await user.click(within(screen.getByRole("group", { name: "Filtrar por perro" })).getByRole("button", { name: /Toby/ }));
    expect(screen.queryByRole("button", { name: "Abrir paseo de Luna" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir paseo de Toby" })).toBeInTheDocument();
  });

  it("invites to order a walk when there is none", async () => {
    mockWalks.mockResolvedValue({ items: [], nextCursor: null });
    const onGo = vi.fn();
    const user = await renderScreen({ onGo });

    await user.click(await screen.findByRole("button", { name: "Pedir un paseo" }));
    expect(onGo).toHaveBeenCalledWith("explore");
  });

  it("pages with the cursor", async () => {
    mockWalks
      .mockResolvedValueOnce({ items: [walk()], nextCursor: "c1" })
      .mockResolvedValueOnce({ items: [walk({ id: "w2", dogId: "d2", dogName: "Max" })], nextCursor: null });
    const user = await renderScreen();

    await user.click(await screen.findByRole("button", { name: "Ver más paseos" }));
    expect(await screen.findByRole("button", { name: "Abrir paseo de Max" })).toBeInTheDocument();
    expect(mockWalks).toHaveBeenLastCalledWith("owner-1", "upcoming", "c1");
  });

  it("draws only the buttons the API allows", async () => {
    mockDetail.mockResolvedValue(detail({ allowedActions: ["cancel", "no_show"] }));
    const user = await renderScreen();
    await openLuna(user);

    expect(await screen.findByRole("button", { name: "Cancelar paseo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "El paseador no llegó" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Repetir este paseo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver recorrido/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mapa en vivo")).not.toBeInTheDocument();
  });

  it("shows the walker and the progress steps", async () => {
    mockDetail.mockResolvedValue(detail());
    const user = await renderScreen();
    await openLuna(user);

    const walker = await screen.findByRole("region", { name: "Paseador" });
    expect(within(walker).getByText("Mateo")).toBeInTheDocument();
    expect(within(walker).getByText("★ 4.8 · 23 calificaciones")).toBeInTheDocument();
    const steps = within(screen.getByRole("region", { name: "Progreso del paseo" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual(["Solicitado", "Paseador asignado", "Recogido", "Paseando", "Entregado"]);
    expect(steps[1]).toHaveAttribute("data-current", "true");
  });

  it("cancels the walk only after confirming, and reloads the detail", async () => {
    mockDetail
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail({ status: "cancelled", allowedActions: ["repeat"] }));
    mockCancel.mockResolvedValue({});
    const user = await renderScreen();
    await openLuna(user);

    await user.click(await screen.findByRole("button", { name: "Cancelar paseo" }));
    expect(mockCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("w1"));
    expect(await screen.findByRole("button", { name: /Repetir este paseo/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar paseo" })).not.toBeInTheDocument();
  });

  it("tells the owner the walker is at the door on a no-show 409", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockDetail.mockResolvedValue(detail({ allowedActions: ["no_show"] }));
    mockNoShow.mockRejectedValue(new ApiError("conflict", 409));
    const user = await renderScreen();
    await openLuna(user);

    await user.click(await screen.findByRole("button", { name: "El paseador no llegó" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Mateo está en el punto de recogida; llámalo");
  });

  it("rates the walker from 1 to 5", async () => {
    mockDetail.mockResolvedValue(detail({ status: "done", allowedActions: ["rate"] }));
    mockRate.mockResolvedValue({});
    const user = await renderScreen();
    await openLuna(user);

    await user.click(await screen.findByRole("button", { name: "4 estrellas" }));
    await waitFor(() => expect(mockRate).toHaveBeenCalledWith("w1", 4));
  });

  it("shows the report numbers, and the text only when the status is ok", async () => {
    mockDetail.mockResolvedValue(
      detail({ status: "done", allowedActions: [], report: { status: "ok", text: "Fue un gran paseo.", distanceKm: 2.22, durationMin: 47 } }),
    );
    const user = await renderScreen();
    await openLuna(user);

    const report = await screen.findByRole("region", { name: "Reporte" });
    expect(within(report).getByText("2,2 km")).toBeInTheDocument();
    expect(within(report).getByText("47 min")).toBeInTheDocument();
    expect(within(report).getByText("21 min/km")).toBeInTheDocument();
    expect(within(report).getByText("Fue un gran paseo.")).toBeInTheDocument();
  });

  it("repeats a walk with a new start time", async () => {
    mockDetail.mockResolvedValue(detail({ status: "done", allowedActions: ["repeat"] }));
    mockRepeat.mockResolvedValue({});
    const onRepeated = vi.fn();
    const user = await renderScreen({ onRepeated });
    await openLuna(user);

    await user.click(await screen.findByRole("button", { name: /Repetir este paseo/ }));
    await user.type(screen.getByLabelText("¿Cuándo lo repetimos?"), "2099-01-01T10:00");
    await user.click(screen.getByRole("button", { name: "Publicar de nuevo" }));

    await waitFor(() =>
      expect(mockRepeat).toHaveBeenCalledWith("w1", new Date("2099-01-01T10:00").toISOString()),
    );
    expect(onRepeated).toHaveBeenCalled();
  });

  it("polls the live position every 10 s and stops when the walk ends (409)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockDetail
      .mockResolvedValueOnce(detail({ status: "in_walk", allowedActions: ["track"] }))
      .mockResolvedValue(detail({ status: "done", allowedActions: [] }));
    mockLive
      .mockResolvedValueOnce({ position: null, minutesElapsed: 1 })
      .mockResolvedValueOnce({ position: { lat: 1.22, lng: -77.28, atEpoch: 1 }, minutesElapsed: 12 })
      .mockRejectedValue(new ApiError("This walk is not in progress.", 409));
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    await renderScreen();
    await openLuna(user);

    expect(await screen.findByText("Esperando la primera ubicación…")).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(10_100);
    expect(await screen.findByText("12 de 45 min")).toBeInTheDocument();
    expect(screen.getByLabelText("Mapa en vivo")).toHaveAttribute("data-markers", "1");

    await vi.advanceTimersByTimeAsync(10_100);
    await waitFor(() => expect(screen.queryByLabelText("Mapa en vivo")).not.toBeInTheDocument());
    const calls = mockLive.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockLive.mock.calls.length).toBe(calls);
  });

  it("explains a 404 and offers the way back", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockDetail.mockRejectedValue(new ApiError("Walk not found.", 404));
    const user = await renderScreen();
    await openLuna(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Este paseo no existe o no es tuyo");
    await user.click(screen.getByRole("button", { name: "← Mis paseos" }));
    expect(await screen.findByRole("button", { name: "Abrir paseo de Luna" })).toBeInTheDocument();
  });
});
