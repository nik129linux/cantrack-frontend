/**
 * The marketplace contract from docs/frontend/*: accounts, home panels,
 * bidding, walks, profiles and the walker side. Every path is keyed by the
 * session user id; the API answers 403 for anyone else's.
 */
import { rawRequest, request } from "./api.js";

const enc = encodeURIComponent;

function json(body: unknown): string {
  return JSON.stringify(body);
}

function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text.length === 0 ? "" : `?${text}`;
}

// ---------------------------------------------------------------------------
// Accounts and sessions (auth-role.md)
// ---------------------------------------------------------------------------

export type AccountRole = "owner" | "walker";

export type ApiSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: unknown;
};

export function signupAccount(input: {
  email: string;
  password: string;
  role: AccountRole;
}): Promise<{ user: unknown; session: ApiSession | null }> {
  return request("/auth/signup", { method: "POST", body: json(input), anonymous: true });
}

export function resendVerification(email: string): Promise<{ message: string }> {
  return request("/auth/resend-verification", {
    method: "POST",
    body: json({ email }),
    anonymous: true,
  });
}

export function loginAccount(email: string, password: string): Promise<ApiSession> {
  return request("/auth/login", {
    method: "POST",
    body: json({ email, password }),
    anonymous: true,
  });
}

export function setAccountRole(role: AccountRole): Promise<{ role: AccountRole }> {
  return request("/auth/role", { method: "POST", body: json({ role }) });
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string; session: ApiSession }> {
  return request("/auth/change-password", {
    method: "POST",
    body: json({ currentPassword, newPassword }),
  });
}

export function logoutAccount(scope?: "global"): Promise<void> {
  return request("/auth/logout", {
    method: "POST",
    body: json(scope === undefined ? {} : { scope }),
  });
}

export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return request("/auth/reset-password", {
    method: "POST",
    body: json({ email }),
    anonymous: true,
  });
}

// ---------------------------------------------------------------------------
// Owner home and weather (inicio.md)
// ---------------------------------------------------------------------------

export type HomeWalk = {
  id: string;
  dogName: string | null;
  walkerName: string | null;
  requestedTime: string;
  durationHours: number;
  priceCop: number;
};

export type HomePanel = {
  greetingName: string;
  activeWalk: null | {
    id: string;
    dogName: string | null;
    walkerName: string | null;
    startedAt: string | null;
    minutesElapsed: number;
    lastPosition: null | { lat: number; lng: number; atEpoch: number };
  };
  nextWalk: HomeWalk | null;
  upcoming: HomeWalk[];
  openRequests: {
    id: string;
    dogName: string | null;
    requestedTime: string;
    priceCop: number;
    offerCount: number;
    deadlineAt: string;
  }[];
  counts: { dogs: number; walksDone: number; openRequests: number };
};

export function fetchOwnerHome(ownerId: string): Promise<HomePanel> {
  return request(`/owners/${enc(ownerId)}/home`);
}

export type WeatherCondition = "clear" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export type Weather = {
  lat: number;
  lng: number;
  temperatureC: number;
  condition: WeatherCondition;
  hours: {
    at: string;
    temperatureC: number;
    condition: WeatherCondition;
    precipitationProbability: number;
  }[];
  bestWindow: null | { start: string; end: string; reason: "dry_and_mild" };
  stale: boolean;
};

export function fetchWeather(lat: number, lng: number): Promise<Weather> {
  return request(`/weather${query({ lat, lng })}`);
}

// ---------------------------------------------------------------------------
// Bidding: the owner side (explorar.md, mis-paseos.md)
// ---------------------------------------------------------------------------

export const WALK_DURATIONS = [30, 45, 60, 90, 120] as const;

export type FareSuggestion = {
  suggestedCop: number;
  basis: "market" | "default";
  sampleSize: number;
  minCop: number;
  stepCop: number;
};

export function fetchFareSuggestion(
  durationMinutes: number,
  lat: number,
  lng: number,
): Promise<FareSuggestion> {
  return request(`/bidding/fare-suggestion${query({ durationMinutes, lat, lng })}`);
}

export function fetchNearbyWalkers(
  lat: number,
  lng: number,
): Promise<{ count: number; radiusKm: number }> {
  return request(`/bidding/nearby-walkers${query({ lat, lng })}`);
}

export type BiddingRequestInput = {
  dogId: string;
  windowStart: string;
  durationMinutes: number;
  priceCop: number;
  pickupLat: number;
  pickupLng: number;
};

export type BiddingRequest = {
  id: string;
  status: "open";
  dogId: string;
  requestedTime: string;
  windowEnd: string;
  durationHours: number;
  priceCop: number;
  pickupLat: number;
  pickupLng: number;
  deadlineAt: string;
};

export function createBiddingRequest(input: BiddingRequestInput): Promise<BiddingRequest> {
  return request("/bidding/requests", { method: "POST", body: json(input) });
}

export type ParsedRequest = {
  draft: Partial<BiddingRequestInput>;
  missing: string[];
  aiStatus: "ok" | "unavailable";
};

export function parseRequestText(text: string): Promise<ParsedRequest> {
  return request("/bidding/requests/parse", { method: "POST", body: json({ text }) });
}

export type Offer = {
  offerId: string;
  walkerId: string;
  walkerName: string | null;
  priceCop: number;
  etaMin: number;
  distanceKm: number;
  score: number;
  scoreParts: { price: number; distance: number; rating: number };
  recentRating: number | null;
  allTimeRating: number | null;
  ratingCount: number;
};

/** `null` offers means 304: nothing changed since `etag`. */
export type OffersPoll = { offers: Offer[] | null; etag: string | null };

export async function fetchOffers(requestId: string, etag?: string | null): Promise<OffersPoll> {
  const response = await rawRequest(`/bidding/requests/${enc(requestId)}/offers`, {
    headers: etag ? { "If-None-Match": etag } : {},
  });
  if (response.status === 304) {
    return { offers: null, etag: etag ?? null };
  }
  return { offers: (await response.json()) as Offer[], etag: response.headers.get("ETag") };
}

export function pickOffer(requestId: string, offerId: string): Promise<unknown> {
  return request(`/bidding/requests/${enc(requestId)}/pick`, {
    method: "POST",
    body: json({ offerId }),
  });
}

export type OwnerRequestItem = {
  id: string;
  status: string;
  dogId: string;
  dogName: string | null;
  requestedTime: string;
  durationHours: number;
  priceCop: number;
  offerCount: number;
  deadlineAt: string;
  walkerId: string | null;
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export function fetchOwnerRequests(
  ownerId: string,
  status = "open",
  cursor?: string | null,
): Promise<Page<OwnerRequestItem>> {
  return request(`/owners/${enc(ownerId)}/requests${query({ status, limit: 20, cursor })}`);
}

export type WalkTab = "upcoming" | "active" | "past";
export type WalkStatus = "assigned" | "in_walk" | "done" | "cancelled" | "expired";

export type WalkItem = {
  id: string;
  status: WalkStatus;
  dogId: string;
  dogName: string | null;
  walkerId: string | null;
  walkerName: string | null;
  requestedTime: string;
  durationHours: number;
  priceCop: number;
  canRate: boolean;
  hasReport: boolean;
};

export function fetchOwnerWalks(
  ownerId: string,
  tab: WalkTab,
  cursor?: string | null,
): Promise<Page<WalkItem>> {
  return request(`/owners/${enc(ownerId)}/walks${query({ tab, limit: 20, cursor })}`);
}

export type WalkAction =
  | "pick"
  | "cancel"
  | "no_show"
  | "track"
  | "replay"
  | "repeat"
  | "rate"
  | "check_in"
  | "check_out"
  | "send_gps";

export type WalkDetail = {
  id: string;
  status: string;
  dog: { id: string; name: string };
  walker: null | {
    id: string;
    name: string | null;
    allTimeRating: number | null;
    ratingCount: number;
  };
  requestedTime: string;
  windowEnd: string;
  durationHours: number;
  priceCop: number;
  offerCount: number;
  timeline: { kind: string; at: string }[];
  rating: number | null;
  report: null | {
    status: "ok" | "unavailable" | "disabled";
    text: string | null;
    distanceKm: number;
    durationMin: number;
  };
  allowedActions: WalkAction[];
};

export function fetchWalkDetail(requestId: string): Promise<WalkDetail> {
  return request(`/bidding/requests/${enc(requestId)}`);
}

export function cancelWalk(requestId: string): Promise<unknown> {
  return request(`/bidding/requests/${enc(requestId)}/owner-cancel`, { method: "POST" });
}

export function reportNoShow(requestId: string): Promise<unknown> {
  return request(`/bidding/requests/${enc(requestId)}/no-show`, { method: "POST" });
}

export function rateWalk(requestId: string, rating: number): Promise<unknown> {
  return request(`/bidding/requests/${enc(requestId)}/ratings`, {
    method: "POST",
    body: json({ rating }),
  });
}

export type ReplayPoint = { lat: number; lng: number; atEpoch: number };

export function fetchReplay(requestId: string): Promise<unknown> {
  return request(`/bidding/requests/${enc(requestId)}/replay`);
}

export function repeatWalk(requestId: string, windowStart: string): Promise<BiddingRequest> {
  return request(`/bidding/requests/${enc(requestId)}/repeat`, {
    method: "POST",
    body: json({ windowStart }),
  });
}

export type LiveWalk = {
  position: null | { lat: number; lng: number; atEpoch: number };
  minutesElapsed: number;
};

export function fetchLiveWalk(requestId: string): Promise<LiveWalk> {
  return request(`/bidding/requests/${enc(requestId)}/live`);
}

export function sendGpsPoints(requestId: string, points: ReplayPoint[]): Promise<unknown> {
  return request(`/bidding/requests/${enc(requestId)}/gps`, {
    method: "POST",
    body: json({ points }),
  });
}

// ---------------------------------------------------------------------------
// Profiles, data protection (perfil.md, walker-perfil.md)
// ---------------------------------------------------------------------------

export type Consent = { version: string; at: string };
export const CONSENT_VERSION = "2026-10";

export type OwnerProfile = {
  ownerId: string;
  email: string;
  displayName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  home: null | { lat: number; lng: number; label: string };
  consent: Consent | null;
  stats: { dogs: number; walksDone: number };
};

export type OwnerProfileInput = {
  displayName: string;
  phone?: string | null;
  home?: { lat: number; lng: number; label: string } | null;
};

export function fetchOwnerProfile(ownerId: string): Promise<OwnerProfile> {
  return request(`/owners/${enc(ownerId)}/profile`);
}

export function saveOwnerProfile(ownerId: string, input: OwnerProfileInput): Promise<OwnerProfile> {
  return request(`/owners/${enc(ownerId)}/profile`, { method: "PUT", body: json(input) });
}

function photoForm(photo: Blob): FormData {
  const body = new FormData();
  body.append("photo", photo);
  return body;
}

export function uploadOwnerAvatar(ownerId: string, photo: Blob): Promise<{ avatarUrl: string }> {
  return request(`/owners/${enc(ownerId)}/avatar`, { method: "POST", body: photoForm(photo) });
}

export function recordOwnerConsent(ownerId: string): Promise<Consent> {
  return request(`/owners/${enc(ownerId)}/consent`, {
    method: "POST",
    body: json({ version: CONSENT_VERSION }),
  });
}

export function deleteOwnerAccount(ownerId: string): Promise<void> {
  return request(`/owners/${enc(ownerId)}`, { method: "DELETE", body: json({ confirm: "DELETE" }) });
}

/** Download the JSON export as a Blob plus the file name the server chose. */
export async function downloadExport(
  role: AccountRole,
  userId: string,
): Promise<{ blob: Blob; filename: string }> {
  const base = role === "owner" ? "owners" : "walkers";
  const response = await rawRequest(`/${base}/${enc(userId)}/export`);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return { blob: await response.blob(), filename: match?.[1] ?? "cantrack-export.json" };
}

// ---------------------------------------------------------------------------
// Walker: home, availability, earnings (walker-inicio.md)
// ---------------------------------------------------------------------------

export type WalkerHomeWalk = {
  id: string;
  dogName: string | null;
  ownerName: string | null;
  requestedTime: string;
  durationHours: number;
  priceCop: number;
};

export type WalkerHome = {
  greetingName: string;
  online: boolean;
  activeWalk: WalkerHomeWalk | null;
  nextWalk: WalkerHomeWalk | null;
  today: { walks: number; grossCop: number; commissionCop: number; netCop: number };
  rating: { average: number | null; count: number };
  openNearby: number;
  pendingOffers: number;
};

export function fetchWalkerHome(walkerId: string): Promise<WalkerHome> {
  return request(`/walkers/${enc(walkerId)}/home`);
}

export function setAvailability(
  walkerId: string,
  online: boolean,
  position?: { lat: number; lng: number },
): Promise<{ online: boolean; updatedAt: string | null }> {
  return request(`/walkers/${enc(walkerId)}/availability`, {
    method: "PUT",
    body: json(online && position !== undefined ? { online, ...position } : { online }),
  });
}

export function sendHeartbeat(lat: number, lng: number): Promise<unknown> {
  return request("/walker-position", { method: "PUT", body: json({ lat, lng }) });
}

export type EarningsPeriod = "day" | "week" | "month";

export type Earnings = {
  period: EarningsPeriod;
  from: string;
  to: string;
  simulated: true;
  commissionPct: number;
  walks: number;
  grossCop: number;
  commissionCop: number;
  netCop: number;
  byDay: { date: string; walks: number; grossCop: number; netCop: number }[];
};

export function fetchEarnings(walkerId: string, period: EarningsPeriod): Promise<Earnings> {
  return request(`/walkers/${enc(walkerId)}/earnings${query({ period })}`);
}

// ---------------------------------------------------------------------------
// Walker: inbox and offers (walker-solicitudes.md)
// ---------------------------------------------------------------------------

export type RequestCard = {
  id: string;
  status: "open";
  dogId: string;
  dogName: string | null;
  ownerName: string | null;
  requestedTime: string;
  windowEnd: string;
  durationHours: number;
  deadlineAt: string;
  fareCop: number;
  priceCop: number;
  pickupLat: number;
  pickupLng: number;
  distanceKm: number;
  myOffer: null | { id: string; priceCop: number; kind: "accept" | "counter" };
};

export function fetchOpenRequests(): Promise<RequestCard[]> {
  return request("/bidding/requests/open");
}

export type OfferInput =
  | { kind: "accept"; etaMin: number }
  | { kind: "counter"; priceCop: number; etaMin: number };

export function sendOffer(
  requestId: string,
  input: OfferInput,
): Promise<{ id: string; score: number; priceCop: number; kind: "accept" | "counter" }> {
  return request(`/bidding/requests/${enc(requestId)}/offers`, {
    method: "POST",
    body: json(input),
  });
}

export function withdrawOffer(requestId: string): Promise<void> {
  return request(`/bidding/requests/${enc(requestId)}/offers/mine`, { method: "DELETE" });
}

export type MyOffer = {
  offerId: string;
  requestId: string;
  dogName: string | null;
  requestedTime: string;
  durationHours: number;
  fareCop: number;
  priceCop: number;
  kind: "accept" | "counter";
  status: "pending" | "won" | "lost";
  requestStatus: string;
};

export function fetchMyOffers(walkerId: string, status?: MyOffer["status"]): Promise<MyOffer[]> {
  return request(`/walkers/${enc(walkerId)}/offers${query({ status })}`);
}

/** Minutes to the pickup at 4.5 km/h, as the brief defines the ETA. */
export function etaMinutes(distanceKm: number): number {
  return Math.round((distanceKm / 4.5) * 60);
}

// ---------------------------------------------------------------------------
// Walker: route, clients, profile (walker-rutas/clientes/perfil.md)
// ---------------------------------------------------------------------------

export type DayRouteStop = {
  requestId: string;
  dogName: string | null;
  status: "assigned" | "in_walk" | "done";
  requestedTime: string;
  pickupLat: number;
  pickupLng: number;
  legKm: number;
  legMinutes: number;
  legSource: "graph" | "straight" | "start";
};

export type DayRoute = {
  date: string;
  start: { lat: number; lng: number } | null;
  stops: DayRouteStop[];
  totalKm: number;
  totalMinutes: number;
  nextStopId: string | null;
};

export function fetchDayRoute(walkerId: string, date?: string): Promise<DayRoute> {
  return request(`/walkers/${enc(walkerId)}/route${query({ date })}`);
}

export type DogCareProfile = {
  size: string;
  temperament: string;
  energy: string;
  leashTrained: boolean;
  allergies: string | null;
  medicalNotes: string | null;
  vetContact: string | null;
  emergencyContact: string | null;
};

export type Client = {
  ownerId: string;
  ownerName: string | null;
  dogs: { id: string; name: string | null }[];
  walksDone: number;
  upcoming: number;
  lastWalkAt: string | null;
  grossCop: number;
};

export type ClientDetail = Omit<Client, "dogs"> & {
  phone: string | null;
  dogs: { id: string; name: string | null; profile: DogCareProfile | null }[];
  walks: {
    id: string;
    dogName: string | null;
    status: "assigned" | "in_walk" | "done";
    requestedTime: string;
    priceCop: number;
  }[];
};

export function fetchClientList(walkerId: string): Promise<Client[]> {
  return request(`/walkers/${enc(walkerId)}/clients`);
}

export function fetchClientDetail(walkerId: string, ownerId: string): Promise<ClientDetail> {
  return request(`/walkers/${enc(walkerId)}/clients/${enc(ownerId)}`);
}

export type WalkerAccountProfile = {
  walkerId: string;
  email: string;
  displayName: string | null;
  bio: string | null;
  serviceArea: string | null;
  pricePerWalk: number | null;
  phone: string | null;
  avatarUrl: string | null;
  consent: Consent | null;
  stats: { walksDone: number; rating: { average: number | null; count: number } };
};

export type WalkerAccountProfileInput = {
  displayName: string;
  bio: string | null;
  serviceArea: string | null;
  pricePerWalk: number;
  phone: string | null;
};

export function fetchWalkerAccountProfile(walkerId: string): Promise<WalkerAccountProfile> {
  return request(`/walkers/${enc(walkerId)}/profile`);
}

export function saveWalkerAccountProfile(
  walkerId: string,
  input: WalkerAccountProfileInput,
): Promise<WalkerAccountProfile> {
  return request(`/walkers/${enc(walkerId)}/profile`, { method: "PUT", body: json(input) });
}

export function uploadWalkerAvatar(walkerId: string, photo: Blob): Promise<{ avatarUrl: string }> {
  return request(`/walkers/${enc(walkerId)}/avatar`, { method: "POST", body: photoForm(photo) });
}

export function recordWalkerConsent(walkerId: string): Promise<Consent> {
  return request(`/walkers/${enc(walkerId)}/consent`, {
    method: "POST",
    body: json({ version: CONSENT_VERSION }),
  });
}

export type WalkerHistoryItem = {
  id: string;
  dogName: string | null;
  ownerName: string | null;
  status: string;
  requestedTime: string;
  durationHours: number;
  priceCop: number;
  rating?: number | null;
};

export function fetchWalkerWalks(walkerId: string, tab: WalkTab): Promise<WalkerHistoryItem[]> {
  return request(`/walkers/${enc(walkerId)}/walks${query({ tab })}`);
}

export function deleteWalkerAccount(walkerId: string): Promise<void> {
  return request(`/walkers/${enc(walkerId)}`, { method: "DELETE", body: json({ confirm: "DELETE" }) });
}
