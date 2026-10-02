import { supabase } from "./supabase.js";

export type Dog = {
  id: string;
  name: string;
  breed?: string | null;
  notes?: string | null;
};

export type CreateDogInput = {
  name: string;
  breed?: string;
  notes?: string;
};

export type RouteStop = {
  dogId: string;
  dogName?: string | null;
  pickupTime: string;
};

export type Route = {
  id: string;
  stops: RouteStop[];
};

/** What the server-side vision model made of the photo, when it answered. */
export type AiNote = {
  dogVisible: boolean | null;
  note: string | null;
};

export type CheckInCandidate = {
  dogId: string;
  dogName: string | null;
  similarity: number;
};

export type CheckInResult =
  | {
      autoConfirmed: true;
      dogId: string;
      dogName: string | null;
      similarity: number;
      checkinId: string;
      ai: AiNote;
    }
  | { autoConfirmed: false; candidates: CheckInCandidate[]; ai: AiNote };

export type ConfirmCheckInResult = {
  dogId: string;
  dogName: string | null;
  checkinId: string;
};

export type UndoCheckInResult = {
  message: string;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

type RequestOptions = {
  method?: string;
  body?: string | FormData;
};

/**
 * One validation problem out of a FastAPI `{"detail": [...]}` list, e.g.
 * `{"loc": ["body", "name"], "msg": "String should have at least 1 character"}`.
 * The `body`/`query`/`path` prefix is not part of the field name, so it is dropped:
 * "name: String should have at least 1 character".
 */
function formatValidationIssue(issue: unknown): string {
  if (typeof issue !== "object" || issue === null) {
    return "";
  }

  const { loc, msg } = issue as { loc?: unknown; msg?: unknown };
  const message = typeof msg === "string" ? msg : "";
  const field = Array.isArray(loc)
    ? loc
        .filter((part) => part !== "body" && part !== "query" && part !== "path")
        .map((part) => String(part))
        .join(".")
    : "";

  if (field.length === 0) {
    return message;
  }

  return message.length === 0 ? field : `${field}: ${message}`;
}

/** Turn an error response into a readable Error. The API answers `{"detail": ...}`. */
async function toRequestError(response: Response): Promise<Error> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return new Error(`Request failed with status ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new Error(text);
  }

  if (typeof payload === "object" && payload !== null && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;

    if (typeof detail === "string" && detail.length > 0) {
      return new Error(detail);
    }

    if (Array.isArray(detail)) {
      const issues = detail.map(formatValidationIssue).filter((issue) => issue.length > 0);
      if (issues.length > 0) {
        return new Error(issues.join("; "));
      }
    }
  }

  return new Error(text);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers();

  // A FormData body must not carry a Content-Type: the browser adds the
  // multipart boundary itself.
  if (typeof options.body !== "object") {
    headers.set("Content-Type", "application/json");
  }

  if (data.session?.access_token !== undefined) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });

  if (!response.ok) {
    const error = await toRequestError(response);
    // Callers that need the status (e.g. fetchRequestCheckout mapping the
    // "no checkout yet" 404 to null) read it from the Error; the message —
    // what every existing caller asserts — is untouched.
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}

export function fetchDogs(): Promise<Dog[]> {
  return request<Dog[]>("/dogs");
}

export function createDog(input: CreateDogInput): Promise<Dog> {
  return request<Dog>("/dogs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Upload the reference photos; the API embeds them on the server and stores the mean vector. */
export function enrollPhotos(dogId: string, photos: File[]): Promise<Dog> {
  const body = new FormData();
  for (const photo of photos) {
    body.append("image", photo);
  }

  return request<Dog>(`/dogs/${encodeURIComponent(dogId)}/photos`, {
    method: "POST",
    body,
  });
}

export function fetchRoutes(): Promise<Route[]> {
  return request<Route[]>("/routes");
}

export function fetchRoute(routeId: string): Promise<Route> {
  return request<Route>(`/routes/${encodeURIComponent(routeId)}`);
}

/** Upload the check-in photo; the API embeds it and asks the vision model on the server. */
export function checkIn(routeId: string, photo: File): Promise<CheckInResult> {
  const body = new FormData();
  body.append("image", photo);

  return request<CheckInResult>(`/routes/${encodeURIComponent(routeId)}/checkin`, {
    method: "POST",
    body,
  });
}

/** Confirm the dog the walker picked among the candidates of a non-confident check-in. */
export function confirmCheckIn(routeId: string, dogId: string): Promise<ConfirmCheckInResult> {
  return request<ConfirmCheckInResult>(`/routes/${encodeURIComponent(routeId)}/checkin/confirm`, {
    method: "POST",
    body: JSON.stringify({ dogId }),
  });
}

export function undoCheckIn(routeId: string): Promise<UndoCheckInResult> {
  return request<UndoCheckInResult>(`/routes/${encodeURIComponent(routeId)}/checkin/undo`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// S1 — Requests: walker profiles, the dog questionnaire and walk requests.
// ---------------------------------------------------------------------------

export type WalkerProfile = {
  walkerId: string;
  displayName: string;
  bio: string | null;
  serviceArea: string | null;
  pricePerWalk: number;
};

export type SaveWalkerProfileInput = {
  displayName: string;
  bio: string | null;
  serviceArea: string | null;
  pricePerWalk: number;
};

/** The 8-field questionnaire stored in `dogs.profile`. */
export type DogProfile = {
  size: string;
  temperament: string;
  energy: string;
  leashTrained: boolean;
  allergies: string | null;
  medicalNotes: string | null;
  vetContact: string | null;
  emergencyContact: string | null;
};

export type RequestStatus = "pending" | "accepted" | "declined" | "cancelled";

/** The full request as its owner sees it. */
export type OwnerRequestView = {
  id: string;
  walkerId: string;
  walkerName: string | null;
  dogId: string;
  dogName: string | null;
  status: RequestStatus;
  requestedTime: string;
  pickupLat: number;
  pickupLng: number;
  priceCop: number;
  createdAt: string;
  respondedAt: string | null;
};

/** The dog as the walker may see it: 4 fields while not accepted, all 10 once
 *  the request is accepted (the API gates this by status). */
export type WalkerRequestDog = {
  name: string | null;
  breed: string | null;
  size: string | null;
  temperament: string | null;
  energy?: string | null;
  leashTrained?: boolean | null;
  allergies?: string | null;
  medicalNotes?: string | null;
  vetContact?: string | null;
  emergencyContact?: string | null;
};

/** The request as the walker sees it; pin and full dog only when accepted. */
export type WalkerRequestView = {
  id: string;
  status: RequestStatus;
  requestedTime: string;
  priceCop: number;
  createdAt: string;
  dog: WalkerRequestDog;
  respondedAt?: string | null;
  pickupLat?: number;
  pickupLng?: number;
};

export type CreateRequestInput = {
  walkerId: string;
  dogId: string;
  requestedTime: string;
  pickupLat: number;
  pickupLng: number;
};

export type RequestConflict = {
  requestId: string;
  requestedTime: string;
};

export type AcceptRequestResult = {
  id: string;
  status: "accepted";
  respondedAt: string;
  conflicts: RequestConflict[];
};

export type DeclineRequestResult = {
  id: string;
  status: "declined";
  respondedAt: string;
};

export type CancelRequestResult = {
  id: string;
  status: "cancelled";
};

export function fetchWalkerProfiles(): Promise<WalkerProfile[]> {
  return request<WalkerProfile[]>("/walker-profiles");
}

export function saveWalkerProfile(input: SaveWalkerProfileInput): Promise<WalkerProfile> {
  return request<WalkerProfile>("/walker-profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function saveDogProfile(dogId: string, profile: DogProfile): Promise<DogProfile> {
  return request<DogProfile>(`/dogs/${encodeURIComponent(dogId)}/profile`, {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}

export function createRequest(input: CreateRequestInput): Promise<OwnerRequestView> {
  return request<OwnerRequestView>("/requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** The caller's requests: the owner's sent ones, or the walker's inbox
 *  (pending oldest first). The API scopes and orders by role. */
export function fetchRequests<T = OwnerRequestView | WalkerRequestView>(): Promise<T[]> {
  return request<T[]>("/requests");
}

export function fetchRequest<T = OwnerRequestView | WalkerRequestView>(
  requestId: string,
): Promise<T> {
  return request<T>(`/requests/${encodeURIComponent(requestId)}`);
}

/** Accepting flags (does not block) the walker's time conflicts. */
export function acceptRequest(requestId: string): Promise<AcceptRequestResult> {
  return request<AcceptRequestResult>(
    `/requests/${encodeURIComponent(requestId)}/accept`,
    { method: "POST" },
  );
}

export function declineRequest(requestId: string): Promise<DeclineRequestResult> {
  return request<DeclineRequestResult>(
    `/requests/${encodeURIComponent(requestId)}/decline`,
    { method: "POST" },
  );
}

export function cancelRequest(requestId: string): Promise<CancelRequestResult> {
  return request<CancelRequestResult>(
    `/requests/${encodeURIComponent(requestId)}/cancel`,
    { method: "POST" },
  );
}

/* ------------------------------------------------------------------ */
/* S2: walker panel and pickup plan                                    */
/* ------------------------------------------------------------------ */

/** One accepted request as the walker's client (full questionnaire, pin). */
export type WalkerClient = {
  requestId: string;
  dogId: string;
  dogName: string | null;
  requestedTime: string;
  pickupLat: number;
  pickupLng: number;
  profile: DogProfile | null;
};

export type PlanStop = {
  requestId: string;
  dogId: string;
  dogName: string | null;
  requestedTime: string;
  eta: string;
  legDistanceKm: number;
  flags: string[];
  group: number;
  lateMinutes: number;
  late: boolean;
};

export type SuggestedPlan = {
  date: string;
  stops: PlanStop[];
  totalDistanceKm: number;
  feasible: boolean;
};

export type SuggestPlanInput = {
  date: string;
  utcOffsetMinutes: number;
};

export type RouteStopInput = {
  dogId: string;
  pickupTime: string;
};

/** The walker's clients: dogs with an accepted request addressed to them. */
export function fetchClients(): Promise<WalkerClient[]> {
  return request<WalkerClient[]>("/clients");
}

/** Suggest (never persist) the pickup plan for one local day. */
export function suggestPlan(input: SuggestPlanInput): Promise<SuggestedPlan> {
  return request<SuggestedPlan>("/plans/suggest", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Accept a plan by creating a route through the EXISTING endpoint. */
export function createRoute(stops: RouteStopInput[]): Promise<Route> {
  return request<Route>("/routes", {
    method: "POST",
    body: JSON.stringify({ stops }),
  });
}

// ---------------------------------------------------------------------------
// S3 — Checkout: photos from the walker to the owner, behind a human gate.
// ---------------------------------------------------------------------------

/** One stored photo, served ONLY as a signed URL expiring in 3600 s. */
export type CheckoutPhoto = {
  url: string;
  expiresIn: number;
};

/** The last AI attempt: answered, model down, or skipped at the quota. */
export type AiStatus = "ok" | "unavailable" | "quota";

/**
 * The checkout as its WALKER sees it. `aiNote`/`dogVisible` are the model's
 * read-only provenance; `note` is the walker's own text (the only field the
 * walker edits, and the only text the owner ever sees).
 */
export type WalkerCheckout = {
  id: string;
  requestId: string;
  dogId: string;
  dogName: string | null;
  walkerId: string;
  status: "draft" | "sent";
  photos: CheckoutPhoto[];
  aiNote: string | null;
  dogVisible: boolean | null;
  note: string | null;
  aiStatus: AiStatus;
  sentAt: string | null;
  createdAt: string;
};

/** The checkout as its OWNER sees it: no AI fields, ever. */
export type OwnerCheckout = {
  id: string;
  requestId: string;
  dogId: string;
  dogName: string | null;
  walkerId: string;
  walkerName: string | null;
  note: string | null;
  photos: CheckoutPhoto[];
  sentAt: string;
};

export type TimelineWalkItem = {
  type: "walk";
  requestId: string;
  walkerId: string;
  walkerName: string | null;
  requestedTime: string;
  status: string;
};

export type TimelineCheckoutItem = {
  type: "checkout";
  checkoutId: string;
  requestId: string;
  walkerId: string;
  walkerName: string | null;
  note: string | null;
  sentAt: string;
};

export type TimelineItem = TimelineWalkItem | TimelineCheckoutItem;

export type TimelineOrder = "asc" | "desc";

export type SendCheckoutResult = {
  id: string;
  requestId: string;
  status: "sent";
  sentAt: string;
};

export type AiQuota = {
  used: number;
  limit: number;
  resetsAt: string;
};

/** Upload 1..3 checkout photos (multipart field `image` each, sent untouched —
 * the API validates the magic bytes and stores them in the private bucket). */
export function createCheckout(requestId: string, photos: File[]): Promise<WalkerCheckout> {
  const body = new FormData();
  for (const photo of photos) {
    body.append("image", photo);
  }

  return request<WalkerCheckout>(
    `/requests/${encodeURIComponent(requestId)}/checkout`,
    { method: "POST", body },
  );
}

/** The request's checkout for the walker, or `null` when there is none yet
 * (the API's 404 is the "no checkout" answer, not an error to surface). */
export async function fetchRequestCheckout(
  requestId: string,
): Promise<WalkerCheckout | null> {
  try {
    return await request<WalkerCheckout>(
      `/requests/${encodeURIComponent(requestId)}/checkout`,
    );
  } catch (error: unknown) {
    if ((error as { status?: number }).status === 404) {
      return null;
    }
    throw error;
  }
}

/** The caller's checkouts: SENT-only newest-first for the owner, own rows of
 * any status for the walker. `limit` (1..100) is only sent when given. */
export function fetchCheckouts(limit?: number): Promise<OwnerCheckout[]> {
  const query = limit === undefined ? "" : `?limit=${limit}`;
  return request<OwnerCheckout[]>(`/checkouts${query}`);
}

/** One dog's timeline: accepted walks and sent checkouts mixed in time order. */
export function fetchTimeline(dogId: string, order: TimelineOrder): Promise<TimelineItem[]> {
  return request<TimelineItem[]>(
    `/dogs/${encodeURIComponent(dogId)}/timeline?order=${order}`,
  );
}

/** Edit the walker's note on a draft (`null` clears it for a photos-only
 * checkout). The AI fields are never writable. */
export function updateCheckoutNote(
  checkoutId: string,
  note: string | null,
): Promise<WalkerCheckout> {
  return request<WalkerCheckout>(`/checkouts/${encodeURIComponent(checkoutId)}`, {
    method: "PATCH",
    body: JSON.stringify({ note }),
  });
}

/** The human gate: publish the draft to the owner. Irreversible. */
export function sendCheckout(checkoutId: string): Promise<SendCheckoutResult> {
  return request<SendCheckoutResult>(
    `/checkouts/${encodeURIComponent(checkoutId)}/send`,
    { method: "POST" },
  );
}

/** Ask the vision model again about a draft's photos; at the quota the API
 * answers 429 and the Error carries "Monthly AI limit reached.". */
export function rerunAiNote(checkoutId: string): Promise<WalkerCheckout> {
  return request<WalkerCheckout>(
    `/checkouts/${encodeURIComponent(checkoutId)}/ai-note`,
    { method: "POST" },
  );
}

/** The walker's AI quota for the current UTC month. */
export function fetchAiQuota(): Promise<AiQuota> {
  return request<AiQuota>("/ai-quota");
}
