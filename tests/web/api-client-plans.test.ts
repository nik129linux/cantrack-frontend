// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// S2: three new named functions in apps/web/src/lib/api.ts (AGENTS.md: named
// exports per endpoint, tests mock this module by function name):
// - fetchClients()          GET  /clients
// - suggestPlan(input)      POST /plans/suggest  {date, utcOffsetMinutes}
// - createRoute(stops)      POST /routes         {stops: [{dogId, pickupTime}]}
//   ("Accept plan" reuses the EXISTING routes endpoint — no new endpoint for
//   accepting a plan, per the S2 spec.)
// Same conventions as tests/web/api-client.test.ts and api-client-requests.

vi.mock("../../apps/web/src/lib/supabase.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "tok-123" } } }),
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

async function api() {
  return import("../../apps/web/src/lib/api.js");
}

describe("API client — S2 plans surface", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchClients GETs /clients with the bearer token", async () => {
    const clients = [{ requestId: "r-1", dogName: "Firulais" }];
    mockFetch.mockResolvedValueOnce(jsonResponse(clients));
    const { fetchClients } = await api();
    await expect(fetchClients()).resolves.toEqual(clients);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/clients$/);
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-123");
  });

  it("suggestPlan POSTs /plans/suggest with the exact body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ date: "2026-10-05", stops: [], totalDistanceKm: 0 }));
    const { suggestPlan } = await api();
    await suggestPlan({ date: "2026-10-05", utcOffsetMinutes: -300 });

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/plans\/suggest$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      date: "2026-10-05",
      utcOffsetMinutes: -300,
    });
  });

  it("createRoute POSTs /routes with the stops wrapped in {stops}", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "route-9", stops: [] }));
    const { createRoute } = await api();
    const stops = [
      { dogId: "dog-1", pickupTime: "2026-10-05T10:00:00+00:00" },
      { dogId: "dog-2", pickupTime: "2026-10-05T11:00:00+00:00" },
    ];
    await createRoute(stops);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/routes$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ stops });
  });

  it("turns the API's detail into the Error message", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ detail: "date must be a valid YYYY-MM-DD date." }, 400),
    );
    const { suggestPlan } = await api();
    await expect(suggestPlan({ date: "tomorrow", utcOffsetMinutes: 0 })).rejects.toThrow(
      "date must be a valid YYYY-MM-DD date.",
    );
  });
});
