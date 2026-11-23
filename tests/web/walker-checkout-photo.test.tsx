// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// "Terminar paseo" needs a photo of the dog at return. The server reads it twice:
// CLIP says whether it is the dog picked up (sameAsCheckIn) and the vision model
// says how the dog looks (condition). The AI only advises: the walk closes anyway,
// and a concern is shown to the walker, never hidden.

const mockRoute = vi.fn();
const mockCheckIn = vi.fn();
const mockCheckOut = vi.fn();
const RESIZED = new Blob(["small"], { type: "image/jpeg" });

vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchDayRoute: mockRoute,
  fetchDayRoutePath: vi.fn().mockRejectedValue(new Error("no street line in this test")),
  fetchWalkDetail: vi.fn(),
  checkInWalk: mockCheckIn,
  checkOutWalk: mockCheckOut,
  sendGpsPoints: vi.fn().mockResolvedValue({}),
  walkerCancelWalk: vi.fn(),
  fetchWalkingRoute: vi.fn().mockRejectedValue(new Error("no")),
  markEnRoute: vi.fn(),
  sendHeartbeat: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../apps/web/src/lib/image.js", () => ({ resizeImage: vi.fn().mockResolvedValue(RESIZED) }));
vi.mock("../../apps/web/src/map/MarkersMap.js", () => ({ MarkersMap: () => <div data-testid="map" /> }));
vi.mock("../../apps/web/src/walker/OnlinePill.js", () => ({ OnlinePill: () => null }));

function activeRoute() {
  return {
    date: "2026-10-25",
    start: { lat: 1.214, lng: -77.2811 },
    stops: [],
    totalKm: 0, totalMinutes: 0, nextStopId: null, overdue: [],
    active: { requestId: "b2", dogName: "Luna", requestedTime: "2026-10-25T16:00:00+00:00", durationHours: 0.75,
      startedAt: "2026-10-25T16:02:00+00:00", netCop: 15300, ownerName: "Camila", ownerPhone: null, pickupLat: 1.22, pickupLng: -77.29 },
  };
}

const SAME = { match: "match", similarity: 0.97 };

async function finishWith(ai: Record<string, unknown>) {
  mockCheckOut.mockResolvedValue({ id: "b2", status: "done", walkerId: "walker-1", ai });
  const { WalkerRoutesScreen } = await import("../../apps/web/src/walker/WalkerRoutesScreen.js");
  const user = userEvent.setup();
  render(<WalkerRoutesScreen userId="walker-1" />);
  const card = await screen.findByRole("region", { name: "Paseo en curso con Luna" });
  await user.click(within(card).getByRole("button", { name: "Terminar paseo" }));
  const input = within(card).getByLabelText("Foto de Luna al entregarlo");
  expect(input).toHaveAttribute("accept", "image/*");
  expect(input).toHaveAttribute("capture", "environment");
  await user.upload(input, new File(["raw"], "luna.jpg", { type: "image/jpeg" }));
  await user.click(within(card).getByRole("button", { name: "Sí, terminar" }));
  await waitFor(() => expect(mockCheckOut).toHaveBeenCalledWith("b2", RESIZED));
  expect(await screen.findByText("Paseo terminado · +$15.300 netos")).toBeInTheDocument();
  return user;
}

beforeEach(() => {
  mockRoute.mockReset().mockResolvedValue(activeRoute());
  mockCheckIn.mockReset();
  mockCheckOut.mockReset();
});
afterEach(cleanup);

describe("Check-out photo", () => {
  it("cannot finish without a photo", async () => {
    const { WalkerRoutesScreen } = await import("../../apps/web/src/walker/WalkerRoutesScreen.js");
    const user = userEvent.setup();
    render(<WalkerRoutesScreen userId="walker-1" />);
    const card = await screen.findByRole("region", { name: "Paseo en curso con Luna" });
    await user.click(within(card).getByRole("button", { name: "Terminar paseo" }));
    expect(within(card).getByRole("button", { name: "Sí, terminar" })).toBeDisabled();
    expect(within(card).queryByRole("button", { name: /sin foto/ })).not.toBeInTheDocument();
    expect(mockCheckOut).not.toHaveBeenCalled();
  });

  it("same dog and looks fine: two green confirmations, never a score", async () => {
    await finishWith({ match: "match", similarity: 0.95, sameAsCheckIn: SAME, condition: "ok", note: null });
    expect(screen.getByText("Es el mismo perro que recogiste ✓")).toBeInTheDocument();
    expect(screen.getByText("Se ve bien ✓")).toBeInTheDocument();
    expect(screen.queryByText(/%|0\.9/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a concern shows its note and tells the walker the owner will see it", async () => {
    const user = await finishWith({ match: "match", similarity: 0.95, sameAsCheckIn: SAME, condition: "concern", note: "Cojea de la pata trasera." });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Ojo: Cojea de la pata trasera. El dueño lo verá en su reporte.");
    // "Listo" on the success notice does not hide the concern; "Entendido" does.
    await user.click(screen.getByRole("button", { name: "Listo" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a different dog from the one picked up asks the walker to check", async () => {
    const user = await finishWith({
      match: "uncertain", similarity: 0.6, sameAsCheckIn: { match: "uncertain", similarity: 0.6 }, condition: "ok", note: null,
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No pudimos confirmar que sea el mismo perro que recogiste. Revisa que sea Luna.");
    await user.click(within(alert).getByRole("button", { name: "Sí, es Luna" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("no dog in the photo: a neutral note", async () => {
    await finishWith({ match: "uncertain", similarity: 0.2, sameAsCheckIn: { match: "unknown", similarity: null }, condition: "no_dog", note: null });
    expect(screen.getByText("No vimos un perro en la foto.")).toBeInTheDocument();
  });

  it("AI unavailable: no error, the walk just closes", async () => {
    await finishWith({
      match: "unavailable", similarity: null, sameAsCheckIn: { match: "unavailable", similarity: null }, condition: "unavailable", note: null,
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/✓/)).not.toBeInTheDocument();
  });

  it("a failed check-out keeps the walk and the photo step open", async () => {
    mockCheckOut.mockRejectedValue(new TypeError("Failed to fetch"));
    const { WalkerRoutesScreen } = await import("../../apps/web/src/walker/WalkerRoutesScreen.js");
    const user = userEvent.setup();
    render(<WalkerRoutesScreen userId="walker-1" />);
    const card = await screen.findByRole("region", { name: "Paseo en curso con Luna" });
    await user.click(within(card).getByRole("button", { name: "Terminar paseo" }));
    await user.upload(within(card).getByLabelText("Foto de Luna al entregarlo"), new File(["raw"], "luna.jpg", { type: "image/jpeg" }));
    await user.click(within(card).getByRole("button", { name: "Sí, terminar" }));
    expect(await screen.findByRole("alert")).toHaveClass("wg__warn");
    expect(screen.getByRole("region", { name: "Paseo en curso con Luna" })).toBeInTheDocument();
  });
});

describe("Check-in photo condition", () => {
  it("a concern at pickup asks the walker to tell the owner before leaving", async () => {
    mockRoute.mockResolvedValue({
      ...activeRoute(),
      active: null,
      stops: [{ requestId: "b3", dogName: "Kira", status: "assigned", requestedTime: "2026-10-25T18:00:00+00:00",
        pickupLat: 1.22, pickupLng: -77.29, legKm: 1, legMinutes: 9, legSource: "straight" }],
      nextStopId: "b3",
    });
    mockCheckIn.mockResolvedValue({
      id: "b3", status: "in_walk", walkerId: "walker-1",
      ai: { match: "match", similarity: 0.93, condition: "concern", note: "Tiene una venda en la pata." },
    });
    const { WalkerRoutesScreen } = await import("../../apps/web/src/walker/WalkerRoutesScreen.js");
    const user = userEvent.setup();
    render(<WalkerRoutesScreen userId="walker-1" />);
    const next = await screen.findByRole("region", { name: "Siguiente parada" });
    await user.click(within(next).getByRole("button", { name: "Iniciar paseo de Kira" }));
    const sheet = await screen.findByRole("region", { name: "Iniciar paseo con Kira" });
    await user.upload(within(sheet).getByLabelText("Foto de Kira"), new File(["raw"], "kira.jpg", { type: "image/jpeg" }));
    await user.click(within(sheet).getByRole("button", { name: "Iniciar paseo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ojo: Tiene una venda en la pata. Avísale al dueño antes de salir.");
    expect(screen.getByText("Es Kira ✓")).toBeInTheDocument();
  });
});
