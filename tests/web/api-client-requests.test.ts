// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// S1: the api.ts wrapper grows one named function per new endpoint (AGENTS.md:
// named exports, tests mock this module by function name). Same conventions as
// tests/web/api-client.test.ts: fetch and the Supabase session are faked, and
// the wrapper must attach the bearer token, send JSON, and turn the API's
// `{"detail": ...}` errors into Error(message).

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

describe("API client — S1 requests surface", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchWalkerProfiles GETs /walker-profiles with the bearer token", async () => {
    const profiles = [{ walkerId: "w-1", displayName: "Nico Walks", bio: null,
      serviceArea: "Laureles", pricePerWalk: 25000 }];
    mockFetch.mockResolvedValueOnce(jsonResponse(profiles));
    const { fetchWalkerProfiles } = await api();
    await expect(fetchWalkerProfiles()).resolves.toEqual(profiles);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/walker-profiles$/);
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-123");
  });

  it("saveWalkerProfile PUTs /walker-profile with the exact JSON body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const { saveWalkerProfile } = await api();
    const dto = { displayName: "Nico Walks", bio: "Five years", serviceArea: "Laureles",
      pricePerWalk: 25000 };
    await saveWalkerProfile(dto);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/walker-profile$/);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(dto);
  });

  it("saveDogProfile PUTs /dogs/{id}/profile with the exact questionnaire", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const { saveDogProfile } = await api();
    const profile = { size: "medium", temperament: "friendly", energy: "high",
      leashTrained: true, allergies: null, medicalNotes: null, vetContact: null,
      emergencyContact: null };
    await saveDogProfile("dog-1", profile);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/dogs\/dog-1\/profile$/);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(profile);
  });

  it("createRequest POSTs /requests with the exact payload", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "r-1" }));
    const { createRequest } = await api();
    const dto = { walkerId: "w-1", dogId: "dog-1",
      requestedTime: "2026-10-05T10:00", pickupLat: 6.2, pickupLng: -75.5 };
    await createRequest(dto);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/requests$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(dto);
  });

  it("fetchRequests GETs /requests", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    const { fetchRequests } = await api();
    await expect(fetchRequests()).resolves.toEqual([]);
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/requests$/);
  });

  it("fetchRequest GETs one request by id", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "r-9" }));
    const { fetchRequest } = await api();
    await expect(fetchRequest("r-9")).resolves.toEqual({ id: "r-9" });
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/requests\/r-9$/);
  });

  it.each([
    ["acceptRequest", /\/requests\/r-1\/accept$/],
    ["declineRequest", /\/requests\/r-1\/decline$/],
    ["cancelRequest", /\/requests\/r-1\/cancel$/],
  ])("%s POSTs the action sub-resource", async (fnName, urlPattern) => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "r-1", status: "accepted" }));
    const mod = await api();
    await (mod as Record<string, (id: string) => Promise<unknown>>)[fnName as string]("r-1");

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(urlPattern as RegExp);
    expect(init.method).toBe("POST");
  });

  it("turns the API's detail into the Error message", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Request not found." }, 404));
    const { acceptRequest } = await api();
    await expect(acceptRequest("r-404")).rejects.toThrow("Request not found.");
  });
});
