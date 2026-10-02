// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// S3: the api.ts functions of the checkout flow. Same conventions as
// api-client.test.ts / api-client-requests.test.ts: fetch and the Supabase
// session are faked; multipart uploads carry every file as field "image" and
// let the browser set the boundary; the API's {"detail": ...} becomes an
// Error, including the 429 quota answer.

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

function photo(name: string): File {
  return new File([name === "a.png" ? "bytes-a" : "bytes-b"], name, { type: "image/png" });
}

async function api() {
  return import("../../apps/web/src/lib/api.js");
}

describe("API client — S3 checkout surface", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createCheckout uploads every photo as multipart field 'image'", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "c-1" }, 201));
    const { createCheckout } = await api();
    const files = [photo("a.png"), photo("b.png")];
    await createCheckout("r-1", files);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/requests\/r-1\/checkout$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const sent = [...(init.body as FormData).getAll("image")] as File[];
    expect(sent.map((f) => f.name)).toEqual(["a.png", "b.png"]);
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-123");
  });

  it("fetchRequestCheckout GETs the request's checkout", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "c-1", status: "draft" }));
    const { fetchRequestCheckout } = await api();
    await expect(fetchRequestCheckout("r-1")).resolves.toEqual({ id: "c-1", status: "draft" });
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/requests\/r-1\/checkout$/);
  });

  it("fetchCheckouts GETs the list and appends limit when given", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    // One mocked response per awaited call: the second fetchCheckouts below
    // is a second request, and without its own response the shared request()
    // helper would hit `undefined.ok` — every implementation that propagates
    // fetch failures (which the screen error states depend on) rejects here.
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    const { fetchCheckouts } = await api();
    await fetchCheckouts();
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/checkouts$/);
    await fetchCheckouts(20);
    expect(String(mockFetch.mock.calls[1][0])).toMatch(/\/checkouts\?limit=20$/);
  });

  it("fetchTimeline GETs the dog timeline with the order param", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    const { fetchTimeline } = await api();
    await fetchTimeline("dog-1", "asc");
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/dogs\/dog-1\/timeline\?order=asc$/);
  });

  it("updateCheckoutNote PATCHes the exact note", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "c-1" }));
    const { updateCheckoutNote } = await api();
    await updateCheckoutNote("c-1", "Edited by the walker.");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/checkouts\/c-1$/);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ note: "Edited by the walker." });
  });

  it.each([
    ["sendCheckout", /\/checkouts\/c-1\/send$/],
    ["rerunAiNote", /\/checkouts\/c-1\/ai-note$/],
  ])("%s POSTs its action sub-resource", async (fnName, urlPattern) => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "c-1" }));
    const mod = (await api()) as Record<string, (id: string) => Promise<unknown>>;
    await mod[fnName as string]("c-1");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(urlPattern as RegExp);
    expect(init.method).toBe("POST");
  });

  it("fetchAiQuota GETs /ai-quota", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ used: 3, limit: 60, resetsAt: "x" }));
    const { fetchAiQuota } = await api();
    await expect(fetchAiQuota()).resolves.toEqual({ used: 3, limit: 60, resetsAt: "x" });
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/ai-quota$/);
  });

  it("turns the 429 quota detail into the Error message", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Monthly AI limit reached." }, 429));
    const { rerunAiNote } = await api();
    await expect(rerunAiNote("c-1")).rejects.toThrow("Monthly AI limit reached.");
  });
});
