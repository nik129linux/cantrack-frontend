/** Fixtures for the dev-only `?preview=` pages. Real screens read the API. */
import type { DayRoute, HomePanel, Weather, WalkerHome } from "../lib/marketplace.js";
import { bogotaDate } from "../lib/format.js";

export type HomeRole = "owner" | "walker";

export const PREVIEW_OWNER_HOME: HomePanel = {
  greetingName: "Camila",
  activeWalk: null,
  nextWalk: {
    id: "w1",
    dogName: "Luna",
    walkerName: "Mateo",
    requestedTime: "2026-10-27T22:00:00+00:00",
    durationHours: 0.75,
    priceCop: 15000,
  },
  upcoming: [
    {
      id: "w1",
      dogName: "Luna",
      walkerName: "Mateo",
      requestedTime: "2026-10-27T22:00:00+00:00",
      durationHours: 0.75,
      priceCop: 15000,
    },
    {
      id: "w2",
      dogName: "Luna",
      walkerName: null,
      requestedTime: "2026-10-28T12:30:00+00:00",
      durationHours: 0.5,
      priceCop: 10000,
    },
  ],
  openRequests: [
    {
      id: "r1",
      dogName: "Max",
      requestedTime: "2026-10-28T13:00:00+00:00",
      priceCop: 12000,
      offerCount: 3,
      deadlineAt: "2026-10-27T20:10:00+00:00",
    },
  ],
  counts: { dogs: 2, walksDone: 7, openRequests: 1 },
};

export const PREVIEW_WEATHER: Weather = {
  lat: 1.2136,
  lng: -77.2811,
  temperatureC: 14,
  condition: "cloudy",
  hours: [
    { at: "2026-10-27T15:00:00+00:00", temperatureC: 14, condition: "cloudy", precipitationProbability: 20 },
    { at: "2026-10-27T17:00:00+00:00", temperatureC: 17, condition: "clear", precipitationProbability: 5 },
    { at: "2026-10-27T20:00:00+00:00", temperatureC: 16, condition: "cloudy", precipitationProbability: 30 },
    { at: "2026-10-27T23:00:00+00:00", temperatureC: 13, condition: "drizzle", precipitationProbability: 60 },
  ],
  bestWindow: { start: "2026-10-27T16:00:00+00:00", end: "2026-10-27T18:00:00+00:00", reason: "dry_and_mild" },
  stale: false,
};

export const PREVIEW_WALKER_HOME: WalkerHome = {
  greetingName: "Mateo",
  online: true,
  activeWalk: null,
  nextWalk: {
    id: "w1",
    dogName: "Luna",
    ownerName: "Camila",
    requestedTime: "2026-10-27T22:00:00+00:00",
    durationHours: 0.75,
    priceCop: 17000,
  },
  today: { walks: 2, grossCop: 35000, commissionCop: 3500, netCop: 31500 },
  rating: { average: 4.67, count: 12 },
  openNearby: 3,
  nearby: [
    { id: "o1", dogName: "Toby", requestedTime: "2026-10-27T20:00:00+00:00", durationHours: 0.5, priceCop: 14000, distanceKm: 0.4, offered: false },
    { id: "o2", dogName: "Kira", requestedTime: "2026-10-27T23:00:00+00:00", durationHours: 1, priceCop: 22000, distanceKm: 1.1, offered: true },
    { id: "o3", dogName: "Rocky", requestedTime: "2026-10-28T13:00:00+00:00", durationHours: 0.75, priceCop: 17000, distanceKm: 1.8, offered: false },
  ],
  pendingOffers: 1,
};

/**
 * A demo day for Rutas in preview: one walk done, two still to do and one
 * late walk from yesterday. Times are relative to `now` so the timer and the
 * "next stop" always make sense; other days only carry the late walk.
 */
export function makePreviewRoute(date: string, now: number = Date.now()): DayRoute {
  const iso = (ms: number) => new Date(ms).toISOString();
  const minute = 60_000;
  const overdue = [
    { requestId: "demo-luna", dogName: "Luna", requestedTime: iso(now - 26 * 60 * minute), durationHours: 0.75 },
  ];
  if (date !== bogotaDate(new Date(now))) {
    return { date, start: { lat: 1.2136, lng: -77.2811 }, stops: [], totalKm: 0, totalMinutes: 0, nextStopId: null, overdue, active: null };
  }
  // Keep every stop on today's local date, even late at night (Bogota is UTC-5).
  const endOfDay = Date.parse(`${date}T23:50:00-05:00`);
  const later = (minutes: number, rank: number) => Math.min(now + minutes * minute, endOfDay - (2 - rank) * 5 * minute);
  const stops: DayRoute["stops"] = [
    {
      requestId: "demo-rocky", dogName: "Rocky", status: "done", requestedTime: iso(now - 150 * minute),
      pickupLat: 1.2168, pickupLng: -77.2852, legKm: 0.6, legMinutes: 8, legSource: "straight",
      durationHours: 0.5, netCop: 13500, ownerName: null, ownerPhone: null,
    },
    {
      requestId: "demo-max", dogName: "Max", status: "assigned", requestedTime: iso(later(25, 0)),
      pickupLat: 1.2102, pickupLng: -77.2788, legKm: 0.9, legMinutes: 12, legSource: "straight",
      durationHours: 0.75, netCop: 16200, ownerName: "Camila Rosero", ownerPhone: "3001234567",
    },
    {
      requestId: "demo-kira", dogName: "Kira", status: "assigned", requestedTime: iso(later(120, 1)),
      pickupLat: 1.2071, pickupLng: -77.2735, legKm: 0.7, legMinutes: 9, legSource: "straight",
      durationHours: 1, netCop: 18000, ownerName: "Andrés Burbano", ownerPhone: "3109876543",
    },
  ];
  return {
    date,
    start: { lat: 1.2136, lng: -77.2811 },
    stops,
    totalKm: 2.2,
    totalMinutes: 29,
    nextStopId: "demo-max",
    overdue,
    active: null,
  };
}
