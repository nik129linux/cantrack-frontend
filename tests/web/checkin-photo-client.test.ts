// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// checkInWalk(requestId, photo?) in apps/web/src/lib/marketplace.ts:
// POST /bidding/requests/:id/check-in, with an optional multipart `image`.

vi.mock("../../apps/web/src/lib/supabase.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "tok-123" } } }),
    },
  },
}));

const mockFetch = vi.fn();

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [string, RequestInit];
  return { url: String(url), init };
}

describe("checkInWalk", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("without a photo POSTs no body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "b2", status: "in_walk", walkerId: "w1" }));
    const { checkInWalk } = await import("../../apps/web/src/lib/marketplace.js");
    await expect(checkInWalk("b2")).resolves.toEqual({ id: "b2", status: "in_walk", walkerId: "w1" });
    const { url, init } = lastCall();
    expect(url).toContain("/bidding/requests/b2/check-in");
    expect(init.method).toBe("POST");
    expect(init.body ?? null).toBeNull();
  });

  it("with a photo sends it as the multipart field image and returns ai", async () => {
    const answer = { id: "b2", status: "in_walk", walkerId: "w1", ai: { match: "match", similarity: 0.93 } };
    mockFetch.mockResolvedValueOnce(jsonResponse(answer));
    const { checkInWalk } = await import("../../apps/web/src/lib/marketplace.js");
    await expect(checkInWalk("b2", new Blob(["jpg"], { type: "image/jpeg" }))).resolves.toEqual(answer);
    const { init } = lastCall();
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("image")).toBeInstanceOf(Blob);
    expect(new Headers(init.headers).get("Content-Type")).toBeNull();
  });
});
