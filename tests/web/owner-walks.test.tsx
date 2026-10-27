// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mis paseos (owner), docs/frontend/mis-paseos.md: tabs with cursor, the detail
// draws buttons ONLY from allowedActions, live map polled every 10 s, 409 stops it.

const mockWalks = vi.fn();
const mockDetail = vi.fn();
const mockLive = vi.fn();
const mockCancel = vi.fn();
const mockNoShow = vi.fn();
const mockRate = vi.fn();
const mockRepeat = vi.fn();
const mockReplay = vi.fn();

vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchOwnerWalks: mockWalks,
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

function walk(over: Record<string, unknown> = {}) {
  return {
    id: "w1",
    status: "assigned",
    dogId: "d1",
    dogName: "Luna",
    walkerId: "m1",
    walkerName: "Mateo",
    requestedTime: "2026-10-28T22:00:00+00:00",
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
    requestedTime: "2026-10-28T22:00:00+00:00",
    windowEnd: "2026-10-28T23:00:00+00:00",
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

async function renderScreen(props: Record<string, unknown> = {}) {
  const { OwnerWalksScreen } = await import("../../apps/web/src/owner/OwnerWalksScreen.js");
  const user = userEvent.setup();
  render(<OwnerWalksScreen userId="owner-1" {...props} />);
  return user;
}

describe("Owner Mis paseos", () => {
  beforeEach(() => {
    cleanup();
    for (const mock of [mockWalks, mockDetail, mockLive, mockCancel, mockNoShow, mockRate, mockRepeat, mockReplay]) {
      mock.mockReset();
    }
    mockWalks.mockResolvedValue({ items: [walk()], nextCursor: null });
  });

  afterEach(() => vi.useRealTimers());

  it("lists the upcoming walks and loads the other tabs on demand", async () => {
    const user = await renderScreen();

    expect(await screen.findByText("Luna · Programado")).toBeInTheDocument();
    expect(mockWalks).toHaveBeenCalledWith("owner-1", "upcoming", undefined);

    mockWalks.mockResolvedValueOnce({ items: [walk({ id: "w9", status: "done", canRate: true, hasReport: true })], nextCursor: null });
    await user.click(screen.getByRole("button", { name: "Pasados" }));

    expect(await screen.findByText("Luna · Terminado")).toBeInTheDocument();
    expect(screen.getByText("Califica a Mateo")).toBeInTheDocument();
    expect(screen.getByText("Reporte")).toBeInTheDocument();
    expect(mockWalks).toHaveBeenLastCalledWith("owner-1", "past", undefined);
  });

  it("pages with the cursor", async () => {
    mockWalks
      .mockResolvedValueOnce({ items: [walk()], nextCursor: "c1" })
      .mockResolvedValueOnce({ items: [walk({ id: "w2", dogName: "Max" })], nextCursor: null });
    const user = await renderScreen();

    await user.click(await screen.findByRole("button", { name: "Ver más" }));
    expect(await screen.findByText("Max · Programado")).toBeInTheDocument();
    expect(mockWalks).toHaveBeenLastCalledWith("owner-1", "upcoming", "c1");
  });

  it("draws only the buttons the API allows", async () => {
    mockDetail.mockResolvedValue(detail({ allowedActions: ["cancel", "no_show"] }));
    const user = await renderScreen();
    await user.click(await screen.findByRole("button", { name: "Abrir paseo de Luna" }));

    expect(await screen.findByRole("button", { name: "Cancelar paseo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "El paseador no llegó" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Repetir paseo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver recorrido" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mapa en vivo")).not.toBeInTheDocument();
  });

  it("cancels the walk and reloads the detail", async () => {
    mockDetail
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail({ status: "cancelled", allowedActions: ["repeat"] }));
    mockCancel.mockResolvedValue({});
    const user = await renderScreen();
    await user.click(await screen.findByRole("button", { name: "Abrir paseo de Luna" }));

    await user.click(await screen.findByRole("button", { name: "Cancelar paseo" }));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("w1"));
    expect(await screen.findByRole("button", { name: "Repetir paseo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar paseo" })).not.toBeInTheDocument();
  });

  it("tells the owner the walker is at the door on a no-show 409", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockDetail.mockResolvedValue(detail({ allowedActions: ["no_show"] }));
    mockNoShow.mockRejectedValue(new ApiError("conflict", 409));
    const user = await renderScreen();
    await user.click(await screen.findByRole("button", { name: "Abrir paseo de Luna" }));

    await user.click(await screen.findByRole("button", { name: "El paseador no llegó" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mateo está en el punto de recogida; llámalo",
    );
  });

  it("rates the walker from 1 to 5", async () => {
    mockDetail.mockResolvedValue(detail({ status: "done", allowedActions: ["rate"] }));
    mockRate.mockResolvedValue({});
    const user = await renderScreen();
    await user.click(await screen.findByRole("button", { name: "Abrir paseo de Luna" }));

    await user.click(await screen.findByRole("button", { name: "4 estrellas" }));
    await waitFor(() => expect(mockRate).toHaveBeenCalledWith("w1", 4));
  });

  it("shows the report numbers, and the text only when the status is ok", async () => {
    mockDetail.mockResolvedValue(
      detail({ status: "done", allowedActions: [], report: { status: "ok", text: "Fue un gran paseo.", distanceKm: 2.22, durationMin: 47 } }),
    );
    const user = await renderScreen();
    await user.click(await screen.findByRole("button", { name: "Abrir paseo de Luna" }));

    const report = await screen.findByRole("region", { name: "Reporte" });
    expect(within(report).getByText("2.22 km · 47 min")).toBeInTheDocument();
    expect(within(report).getByText("Fue un gran paseo.")).toBeInTheDocument();
  });

  it("repeats a walk with a new start time", async () => {
    mockDetail.mockResolvedValue(detail({ status: "done", allowedActions: ["repeat"] }));
    mockRepeat.mockResolvedValue({});
    const onRepeated = vi.fn();
    const user = await renderScreen({ onRepeated });
    await user.click(await screen.findByRole("button", { name: "Abrir paseo de Luna" }));

    await user.click(await screen.findByRole("button", { name: "Repetir paseo" }));
    await user.type(screen.getByLabelText("Nuevo día y hora"), "2099-01-01T10:00");
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
    await user.click(await screen.findByRole("button", { name: "Abrir paseo de Luna" }));

    expect(await screen.findByText("Esperando la primera ubicación del paseador")).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(10_100);
    expect(await screen.findByText("12 min de paseo")).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: "Abrir paseo de Luna" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Este paseo no existe o no es tuyo");
    await user.click(screen.getByRole("button", { name: "← Volver" }));
    expect(await screen.findByText("Luna · Programado")).toBeInTheDocument();
  });
});
