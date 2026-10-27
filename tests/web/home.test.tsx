// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Home panel: the owner reads /owners/{id}/home and /weather; the walker
// side still shows sample data until its brief lands.
// The animated city needs ResizeObserver/canvas-free DOM only, so it is stubbed.

vi.mock("../../apps/web/src/city/CityScene.js", () => ({
  CityScene: () => <div data-testid="city" />,
}));

async function importHome() {
  return import("../../apps/web/src/home/HomeDashboard.js");
}

describe("formatCop and suggestedFare", () => {
  it("formats Colombian pesos with dots", async () => {
    const { formatCop } = await import("../../apps/web/src/home/sampleData.js");
    expect(formatCop(0)).toBe("$0");
    expect(formatCop(950)).toBe("$950");
    expect(formatCop(15000)).toBe("$15.000");
    expect(formatCop(1250000)).toBe("$1.250.000");
  });

  it("suggests a fare per duration, never below the minimum", async () => {
    const { suggestedFare } = await import("../../apps/web/src/home/sampleData.js");
    expect(suggestedFare(30)).toBe(10000);
    expect(suggestedFare(45)).toBe(15000);
    expect(suggestedFare(60)).toBe(20000);
    expect(suggestedFare(5)).toBe(8000);
  });
});

vi.mock("../../apps/web/src/lib/supabase.js", () => ({ supabase: { auth: {} } }));

const mockFetchOwnerHome = vi.fn();
const mockFetchWeather = vi.fn();
vi.mock("../../apps/web/src/lib/marketplace.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/web/src/lib/marketplace.js")>()),
  fetchOwnerHome: mockFetchOwnerHome,
  fetchWeather: mockFetchWeather,
}));

const weather = {
  lat: 1.2,
  lng: -77.2,
  temperatureC: 14,
  condition: "cloudy",
  hours: [{ at: "2026-10-27T17:00:00+00:00", temperatureC: 17, condition: "clear", precipitationProbability: 5 }],
  bestWindow: { start: "2026-10-27T16:00:00+00:00", end: "2026-10-27T18:00:00+00:00", reason: "dry_and_mild" },
  stale: false,
};

const walk = {
  id: "w1",
  dogName: "Luna",
  walkerName: "Mateo",
  requestedTime: "2026-10-27T22:00:00+00:00",
  durationHours: 0.75,
  priceCop: 15000,
};

function panel(overrides: Record<string, unknown> = {}) {
  return {
    greetingName: "Camila",
    activeWalk: null,
    nextWalk: walk,
    upcoming: [walk, { ...walk, id: "w2", walkerName: null }],
    openRequests: [
      { id: "r1", dogName: "Max", requestedTime: "2026-10-28T13:00:00+00:00", priceCop: 12000, offerCount: 3, deadlineAt: "2026-10-27T20:10:00+00:00" },
    ],
    counts: { dogs: 2, walksDone: 7, openRequests: 1 },
    ...overrides,
  };
}

describe("Home panel — owner", () => {
  beforeEach(() => {
    cleanup();
    mockFetchOwnerHome.mockReset();
    mockFetchWeather.mockReset();
    mockFetchWeather.mockResolvedValue(weather);
  });

  it("greets by name and draws the ticket, weather, upcoming walks and open requests from /home", async () => {
    mockFetchOwnerHome.mockResolvedValue(panel());
    const { HomeShell } = await importHome();
    render(<HomeShell role="owner" userId="owner-1" />);

    expect(await screen.findByRole("heading", { name: "Hola, Camila", level: 1 })).toBeInTheDocument();
    expect(mockFetchOwnerHome).toHaveBeenCalledWith("owner-1");
    const ticket = screen.getByRole("region", { name: "Próximo paseo" });
    expect(within(ticket).getByText("Luna")).toBeInTheDocument();
    expect(within(ticket).getByText(/con Mateo/)).toBeInTheDocument();

    const upcoming = screen.getByRole("region", { name: "Paseos programados" });
    expect(within(upcoming).getAllByRole("listitem")).toHaveLength(2);
    expect(within(upcoming).getByText(/Paseador asignado/)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Ver ofertas de Max" })).toHaveTextContent("3 ofertas");
    expect(await screen.findByText(/Mejor hora para pasear/)).toBeInTheDocument();
    expect(screen.getByTestId("city")).toBeInTheDocument();
  });

  it("shows the live card instead of the ticket while a walk is active", async () => {
    mockFetchOwnerHome.mockResolvedValue(
      panel({
        activeWalk: { id: "w1", dogName: "Luna", walkerName: "Mateo", startedAt: null, minutesElapsed: 12, lastPosition: null },
      }),
    );
    const { HomeShell } = await importHome();
    render(<HomeShell role="owner" userId="owner-1" />);

    const live = await screen.findByRole("region", { name: "Paseo en curso" });
    expect(within(live).getByText(/Luna está paseando con Mateo/)).toBeInTheDocument();
    expect(within(live).getByText("12 min")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Próximo paseo" })).not.toBeInTheDocument();
  });

  it("hides the weather card when the weather service is down", async () => {
    mockFetchOwnerHome.mockResolvedValue(panel());
    mockFetchWeather.mockRejectedValue(new Error("down"));
    const { HomeShell } = await importHome();
    render(<HomeShell role="owner" userId="owner-1" />);

    await screen.findByRole("heading", { name: "Hola, Camila" });
    await waitFor(() => expect(mockFetchWeather).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Clima" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a server failure with its error code and retries", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    const failure = new ApiError("Something went wrong on our side.", 500);
    failure.errorId = "abc123";
    mockFetchOwnerHome.mockRejectedValueOnce(failure).mockResolvedValueOnce(panel());
    const user = userEvent.setup();
    const { HomeShell } = await importHome();
    render(<HomeShell role="owner" userId="owner-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló de nuestro lado. Código: abc123");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Hola, Camila" })).toBeInTheDocument();
  });

  it("signs out when /home answers 403", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockFetchOwnerHome.mockRejectedValue(new ApiError("Forbidden", 403));
    const onForbidden = vi.fn();
    const { HomeShell } = await importHome();
    render(<HomeShell role="owner" userId="owner-1" onForbidden={onForbidden} />);

    await waitFor(() => expect(onForbidden).toHaveBeenCalled());
  });

  it("marks exactly one navigation item as the current page and moves it on click", async () => {
    mockFetchOwnerHome.mockResolvedValue(panel());
    const { HomeShell } = await importHome();
    const user = userEvent.setup();
    render(<HomeShell role="owner" userId="owner-1" />);

    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Inicio",
      "Explorar",
      "Mis perros",
      "Paseos",
      "Perfil",
    ]);
    expect(within(nav).getByRole("button", { name: "Inicio" })).toHaveAttribute("aria-current", "page");

    await user.click(within(nav).getByRole("button", { name: "Paseos" }));

    expect(within(nav).getByRole("button", { name: "Paseos" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("opens Explorar from the empty-state call to action", async () => {
    mockFetchOwnerHome.mockResolvedValue(panel({ nextWalk: null, upcoming: [], openRequests: [] }));
    const user = userEvent.setup();
    const { HomeShell } = await importHome();
    render(<HomeShell role="owner" userId="owner-1" screens={{ explore: <p>pantalla explorar</p> }} />);

    await user.click(await screen.findByRole("button", { name: "Pedir un paseo" }));
    expect(screen.getByText("pantalla explorar")).toBeInTheDocument();
  });
});

describe("Home panel — walker", () => {
  beforeEach(() => cleanup());

  it("greets the walker and lists the three sample requests with their offers", async () => {
    const { HomeDashboard } = await importHome();
    render(<HomeDashboard role="walker" />);

    expect(screen.getByRole("heading", { name: "Hola, paseador", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Pedir un paseo" })).not.toBeInTheDocument();

    const requests = screen.getByRole("region", { name: "Solicitudes" });
    expect(within(requests).getAllByRole("listitem")).toHaveLength(3);
    expect(within(requests).getByText("Luna · $15.000")).toBeInTheDocument();
    expect(within(requests).getByText("Max · $12.000")).toBeInTheDocument();
    expect(within(requests).getByText("Nala · $18.000")).toBeInTheDocument();
  });

  it("accepts one request and declines another, only touching those rows", async () => {
    const { HomeDashboard } = await importHome();
    const user = userEvent.setup();
    render(<HomeDashboard role="walker" />);

    const requests = screen.getByRole("region", { name: "Solicitudes" });
    await user.click(within(requests).getByRole("button", { name: "Aceptar a Luna" }));
    await user.click(within(requests).getByRole("button", { name: "Rechazar a Max" }));

    expect(within(requests).getByText("Aceptada")).toBeInTheDocument();
    expect(within(requests).getByText("Rechazada")).toBeInTheDocument();
    expect(within(requests).queryByRole("button", { name: "Aceptar a Luna" })).not.toBeInTheDocument();
    expect(within(requests).queryByRole("button", { name: "Rechazar a Max" })).not.toBeInTheDocument();
    expect(within(requests).getByRole("button", { name: "Aceptar a Nala" })).toBeInTheDocument();
    expect(within(requests).getByRole("button", { name: "Rechazar a Nala" })).toBeInTheDocument();
  });
});
