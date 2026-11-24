// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock("../../apps/web/src/lib/supabase.js", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
  },
}));

const mockFetch = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("API client — owner statistics", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "owner-token" } },
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchOwnerStats GETs the owner's statistics with the session token", async () => {
    const payload = {
      walksByMonth: [{ month: "2026-10", count: 2 }],
      checkoutsReceived: 3,
      distinctWalkers: 2,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const { fetchOwnerStats } = await import("../../apps/web/src/lib/marketplace.js");

    await expect(fetchOwnerStats("owner-1")).resolves.toEqual(payload);
    const [url, init] = mockFetch.mock.calls[0];
    expect(new URL(String(url), "http://localhost").pathname).toBe("/owners/owner-1/stats");
    expect(init.method ?? "GET").toBe("GET");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer owner-token");
  });

  it("sends no bearer token and surfaces the exact unauthorized error without a session", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Unauthorized." }, 401),
    );

    const { fetchOwnerStats } = await import("../../apps/web/src/lib/marketplace.js");

    await expect(fetchOwnerStats("owner-1")).rejects.toThrow("Unauthorized.");
    const [, init] = mockFetch.mock.calls[0];
    expect(new Headers(init.headers).get("Authorization")).toBeNull();
  });
});
