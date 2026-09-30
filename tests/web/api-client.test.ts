// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The web -> API client (apps/web/src/lib/api.ts). fetch and the Supabase session are faked.

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

function photo(name: string): File {
  return new File(["bytes"], name, { type: "image/jpeg" });
}

describe("API client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the bearer token and JSON content type on JSON requests", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    const { fetchDogs } = await api();
    await fetchDogs();
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/dogs$/);
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok-123");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("enrollPhotos uploads every file as multipart field 'image' and lets the browser set the boundary", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "dog-1", name: "Firulais" }));
    const { enrollPhotos } = await api();
    const files = [photo("a.jpg"), photo("b.jpg"), photo("c.jpg")];
    await enrollPhotos("dog-1", files);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/dogs\/dog-1\/photos$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const sent = (init.body as FormData).getAll("image") as File[];
    expect(sent.map((f) => f.name)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    const headers = new Headers(init.headers);
    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.get("Authorization")).toBe("Bearer tok-123");
  });

  it("checkIn uploads the photo as multipart field 'image' to the route's checkin endpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ autoConfirmed: false, candidates: [], ai: {} }, 200));
    const { checkIn } = await api();
    const file = photo("stop.jpg");
    await checkIn("route-1", file);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/routes\/route-1\/checkin$/);
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("image")).toBeInstanceOf(File);
    expect(((init.body as FormData).get("image") as File).name).toBe("stop.jpg");
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });

  it("confirmCheckIn posts the chosen dog id as JSON", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ dogId: "dog-2", dogName: "Rex", checkinId: "c" }, 201));
    const { confirmCheckIn } = await api();
    await confirmCheckIn("route-1", "dog-2");

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/routes\/route-1\/checkin\/confirm$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ dogId: "dog-2" });
  });

  it("undoCheckIn uses DELETE on the undo endpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: "Check-in undone." }));
    const { undoCheckIn } = await api();
    await undoCheckIn("route-1");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/routes\/route-1\/checkin\/undo$/);
    expect(init.method).toBe("DELETE");
  });

  it("encodes ids in paths", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: "x" }));
    const { undoCheckIn } = await api();
    await undoCheckIn("a/b c");
    expect(String(mockFetch.mock.calls[0][0])).toContain("/routes/a%2Fb%20c/checkin/undo");
  });

  it("turns the API's {detail: string} error into the Error message", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "No dog detected in the photo." }, 400));
    const { checkIn } = await api();
    await expect(checkIn("route-1", photo("t.jpg"))).rejects.toMatchObject({
      message: "No dog detected in the photo.",
    });
  });

  it("turns a validation error list into a readable message, not raw JSON", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ detail: [{ loc: ["body", "name"], msg: "String should have at least 1 character" }] }, 400),
    );
    const { createDog } = await api();
    const err = await createDog({ name: "" }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("{");
    expect((err as Error).message).toMatch(/at least 1 character/i);
  });

  it("falls back to the raw text, then to a status message", async () => {
    const { fetchDogs } = await api();
    mockFetch.mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }));
    await expect(fetchDogs()).rejects.toMatchObject({ message: "Bad gateway" });
    mockFetch.mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(fetchDogs()).rejects.toMatchObject({
      message: "Request failed with status 500.",
    });
  });
});
