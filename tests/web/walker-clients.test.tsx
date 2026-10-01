// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { cleanup } from "@testing-library/react";

// S2: the walker's Clients tab — the dogs with an ACCEPTED request addressed
// to the caller, each with the pin, the time and the full questionnaire (the
// API already applied the privacy gate; the screen must render the full data
// and NEVER show raw ISO timestamps — polish item 3: times go through
// formatWhen / Intl.DateTimeFormat).

const mockFetchClients = vi.fn();
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchClients: mockFetchClients,
}));

function loadScreen(path: string): Promise<any> {
  return import(/* @vite-ignore */ `../../apps/web/src/${path}.js`);
}

async function renderClients() {
  const { WalkerClientsScreen } = await loadScreen("walker/WalkerClientsScreen");
  return render(<WalkerClientsScreen />);
}

function formatted(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

const CLIENT = {
  requestId: "r-1",
  dogId: "dog-1",
  dogName: "Firulais",
  requestedTime: "2026-10-05T10:00:00+00:00",
  pickupLat: 6.2,
  pickupLng: -75.5,
  profile: {
    size: "medium",
    temperament: "friendly",
    energy: "high",
    leashTrained: true,
    allergies: "Peanuts",
    medicalNotes: "Hip dysplasia",
    vetContact: "Vet Laura 3001112233",
    emergencyContact: "Ana 3104445566",
  },
};

afterEach(cleanup);

describe("Walker clients screen (S2)", () => {
  beforeEach(() => {
    mockFetchClients.mockReset();
    mockFetchClients.mockResolvedValue([]);
  });

  it("shows a loading state while the clients load", async () => {
    mockFetchClients.mockReturnValue(new Promise(() => {}));
    await renderClients();
    expect(screen.getByText("Loading clients...")).toBeInTheDocument();
  });

  it("shows the error inline when the list fails to load", async () => {
    mockFetchClients.mockRejectedValue(new Error("Boom"));
    await renderClients();
    expect(await screen.findByRole("alert")).toHaveTextContent("Boom");
  });

  it("shows the empty state when there are no accepted requests", async () => {
    await renderClients();
    expect(await screen.findByRole("heading", { name: "My clients" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No clients yet" })).toBeInTheDocument();
    expect(mockFetchClients).toHaveBeenCalledTimes(1);
  });

  it("renders each client with pin, formatted time and the full questionnaire", async () => {
    mockFetchClients.mockResolvedValue([CLIENT]);
    await renderClients();

    expect(await screen.findByText("Firulais")).toBeInTheDocument();
    expect(screen.getByText(formatted(CLIENT.requestedTime))).toBeInTheDocument();
    expect(screen.getByText("6.2, -75.5")).toBeInTheDocument();

    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("friendly")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("Peanuts")).toBeInTheDocument();
    expect(screen.getByText("Hip dysplasia")).toBeInTheDocument();
    expect(screen.getByText("Vet Laura 3001112233")).toBeInTheDocument();
    expect(screen.getByText("Ana 3104445566")).toBeInTheDocument();
  });

  it("never shows the raw ISO timestamp", async () => {
    mockFetchClients.mockResolvedValue([CLIENT]);
    await renderClients();

    await screen.findByText("Firulais");
    expect(screen.queryByText(CLIENT.requestedTime)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-10-05T/)).not.toBeInTheDocument();
  });

  it("says when the owner never filled the questionnaire", async () => {
    mockFetchClients.mockResolvedValue([{ ...CLIENT, profile: null }]);
    await renderClients();

    expect(await screen.findByText("Firulais")).toBeInTheDocument();
    expect(screen.getByText("No questionnaire yet.")).toBeInTheDocument();
    expect(screen.queryByText(/allergies/i)).not.toBeInTheDocument();
  });
});
