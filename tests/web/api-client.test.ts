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
    await expect(enrollPhotos("dog-1", files)).resolves.toEqual({
      id: "dog-1", name: "Firulais", profile: null, hasPhotos: true,
    });

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

  it("fetchDogs maps the profile and photo status without exposing raw row fields", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{
      id: "dog-1", name: "Firulais", breed: "Mix", notes: "Friendly",
      owner_id: "owner-1", embedding: Array(512).fill(0.1),
      profile: {
        size: "medium", temperament: "calm", energy: "low", leash_trained: true,
        allergies: "Chicken", medical_notes: "Medication", vet_contact: "Vet",
        emergency_contact: "Owner",
      },
    }]));
    const { fetchDogs } = await api();
    const dogs = await fetchDogs();
    expect(dogs).toEqual([{
      id: "dog-1", name: "Firulais", breed: "Mix", notes: "Friendly", hasPhotos: true,
      profile: {
        size: "medium", temperament: "calm", energy: "low", leashTrained: true,
        allergies: "Chicken", medicalNotes: "Medication", vetContact: "Vet",
        emergencyContact: "Owner",
      },
    }]);
    expect(dogs[0]).not.toHaveProperty("embedding");
    expect(dogs[0]).not.toHaveProperty("owner_id");
  });

  it.each([
    [null, false], [undefined, false], [[], false], [Array(512).fill(0), true],
    [JSON.stringify(Array(512).fill(0)), true],
  ])("fetchDogs maps embedding %j to hasPhotos %s with a null profile", async (embedding, hasPhotos) => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{
      id: "dog-1", name: "Firulais", profile: null, embedding,
    }]));
    const { fetchDogs } = await api();
    await expect(fetchDogs()).resolves.toEqual([{
      id: "dog-1", name: "Firulais", profile: null, hasPhotos,
    }]);
  });

  it("fetchDogs keeps incomplete profiles and defaults missing fields", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([
      { id: "dog-1", name: "Firulais", profile: { medical_notes: "Medication" } },
      { id: "dog-2", name: "Rex" },
    ]));
    const { fetchDogs } = await api();
    const dogs = await fetchDogs();
    expect(dogs[0].profile).toEqual({
      size: "", temperament: "", energy: "", leashTrained: false,
      allergies: null, medicalNotes: "Medication", vetContact: null, emergencyContact: null,
    });
    expect(dogs[1].profile).toBeNull();
  });

  it.each([null, { size: "small", leash_trained: false }])(
    "createDog sends JSON and maps the row with no photos and profile %j", async (profile) => {
      const input = { name: "Firulais", breed: "Mix", notes: "Friendly" };
      mockFetch.mockResolvedValueOnce(jsonResponse({
        id: "dog-1", ...input, profile, embedding: [1],
      }, 201));
      const { createDog } = await api();
      const dog = await createDog(input);
      expect(dog).toEqual({
        id: "dog-1", ...input, hasPhotos: false,
        profile: profile === null ? null : {
          size: "small", temperament: "", energy: "", leashTrained: false,
          allergies: null, medicalNotes: null, vetContact: null, emergencyContact: null,
        },
      });
      const [url, init] = mockFetch.mock.calls[0];
      expect(String(url)).toMatch(/\/dogs$/);
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify(input));
    },
  );

  it.each([null, Array(512).fill(0.1)])("updateDog sends the exact PATCH body and maps the row", async (embedding) => {
    const patch = { name: "Rex", breed: null, notes: null };
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "a/b c", ...patch, embedding }));
    const { updateDog } = await api();
    await expect(updateDog("a/b c", patch)).resolves.toEqual({
      id: "a/b c", ...patch, profile: null, hasPhotos: embedding !== null,
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/dogs\/a%2Fb%20c$/);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify(patch));
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("deleteDog sends DELETE and discards the response message", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: "Dog deleted." }));
    const { deleteDog } = await api();
    await expect(deleteDog("a/b c")).resolves.toBeUndefined();
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/dogs\/a%2Fb%20c$/);
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("suggestDogTraits sends one image named dog.jpg without showing the mascot", async () => {
    const traits = { breed: "Mix", size: "medium" };
    mockFetch.mockResolvedValueOnce(jsonResponse(traits));
    const { suggestDogTraits } = await api();
    const { subscribe } = await import("../../apps/web/src/mascot/mascotBus.js");
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    try {
      const blob = new Blob(["bytes"], { type: "image/jpeg" });
      await expect(suggestDogTraits("a/b c", blob)).resolves.toEqual(traits);
      const [url, init] = mockFetch.mock.calls[0];
      expect(String(url)).toMatch(/\/dogs\/a%2Fb%20c\/suggest$/);
      expect(init.method).toBe("POST");
      expect(init.body).toBeInstanceOf(FormData);
      const entries = Array.from((init.body as FormData).entries());
      expect(entries).toHaveLength(1);
      expect(entries[0][0]).toBe("image");
      const image = entries[0][1] as File;
      expect(image).toBeInstanceOf(File);
      expect(image.name).toBe("dog.jpg");
      expect(image.size).toBe(blob.size);
      expect(image.type).toBe(blob.type);
      expect(new Headers(init.headers).has("Content-Type")).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("suggestDogTraits surfaces rate limiting as ApiError with status 429", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Rate limited." }, 429));
    const { suggestDogTraits, ApiError } = await api();
    const result = suggestDogTraits("dog-1", photo("ref.jpg"));
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ status: 429, message: "Rate limited." });
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
