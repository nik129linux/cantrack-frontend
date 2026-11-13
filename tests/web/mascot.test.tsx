// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

// The global mascot (apps/web/src/mascot): the API layer reports writes to the
// bus, and GlobalDogLoader shows the dog only for work that is really happening.

vi.mock("../../apps/web/src/lib/supabase.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }),
    },
  },
}));

import {
  beginFarewell,
  beginWork,
  getActivity,
  resetMascot,
} from "../../apps/web/src/mascot/mascotBus.js";
import { GlobalDogLoader, SHOW_DELAY_MS } from "../../apps/web/src/mascot/GlobalDogLoader.js";
import { DogLoader } from "../../apps/web/src/ui/DogLoader.js";

const mockFetch = vi.fn();

function ok(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function pose(): string | null {
  return document.querySelector(".mascot-sprite")?.getAttribute("data-pose") ?? null;
}

describe("mascot bus fed by the API client", () => {
  beforeEach(() => {
    resetMascot();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("tracks a write and reports success", async () => {
    mockFetch.mockResolvedValueOnce(ok());
    const { saveDogProfile } = await import("../../apps/web/src/lib/api.js");
    const saving = saveDogProfile("d1", {} as never);
    expect(getActivity()).toMatchObject({ kind: "working", label: "Guardando…" });
    await saving;
    expect(getActivity()).toMatchObject({ kind: "success" });
  });

  it("reports a failed write as an error", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const { cancelRequest } = await import("../../apps/web/src/lib/api.js");
    await expect(cancelRequest("r1")).rejects.toThrow();
    expect(getActivity()).toMatchObject({ kind: "error" });
  });

  it("leaves reads and silent writes alone", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(ok([])));
    const { fetchDogs } = await import("../../apps/web/src/lib/api.js");
    const { sendHeartbeat, loginAccount } = await import("../../apps/web/src/lib/marketplace.js");
    await fetchDogs();
    await sendHeartbeat(1, 2);
    await loginAccount("a@b.co", "secret");
    expect(getActivity()).toEqual({ kind: "idle" });
  });
});

describe("GlobalDogLoader", () => {
  beforeEach(() => {
    resetMascot();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("never shows the dog for a write that finishes quickly, then jumps for the success", () => {
    render(<GlobalDogLoader />);
    let end!: (outcome: "success" | "error") => void;
    act(() => {
      end = beginWork("Guardando…");
    });
    act(() => vi.advanceTimersByTime(SHOW_DELAY_MS - 100));
    expect(screen.queryByText("Guardando…")).toBeNull();

    act(() => end("success"));
    expect(screen.getByText("¡Listo!")).toBeInTheDocument();
    expect(pose()).toBe("jump");

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText("¡Listo!")).toBeNull();
    expect(getActivity()).toEqual({ kind: "idle" });
  });

  it("walks while a slow write is in flight and turns sad when it fails", () => {
    render(<GlobalDogLoader />);
    let end!: (outcome: "success" | "error") => void;
    act(() => {
      end = beginWork("Guardando…");
    });
    act(() => vi.advanceTimersByTime(SHOW_DELAY_MS + 10));
    expect(screen.getByText("Guardando…")).toBeInTheDocument();
    expect(pose()).toBe("walk");

    act(() => end("error"));
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo completar");
    expect(pose()).toBe("sad");
  });

  it("waves goodbye until the logout has really finished", () => {
    render(<GlobalDogLoader />);
    let done!: () => void;
    act(() => {
      done = beginFarewell();
    });
    expect(screen.getByText("¡Hasta pronto!")).toBeInTheDocument();
    expect(pose()).toBe("bye");

    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("¡Hasta pronto!")).toBeInTheDocument();

    act(() => done());
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText("¡Hasta pronto!")).toBeNull();
  });
});

describe("DogLoader", () => {
  it("announces its label and plays the requested pose", () => {
    render(<DogLoader label="Cargando tus paseos…" pose="walk" />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando tus paseos…");
    expect(pose()).toBe("walk");
  });

  it("waits wagging its tail by default", () => {
    render(<DogLoader label="Cargando…" />);
    expect(pose()).toBe("wait");
  });
});
