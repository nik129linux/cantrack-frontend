/** Fixtures for the dev-only `?preview=` pages. Real screens read the API. */
import type { HomePanel, Weather, WalkerHome } from "../lib/marketplace.js";

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
  pendingOffers: 1,
};
