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
    throw await toRequestError(response);
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
