/** Placeholder content for the home preview. None of it comes from the API yet. */

export type HomeRole = "owner" | "walker";

export type SampleWalk = {
  id: string;
  title: string;
  detail: string;
  when: string;
};

export type SampleRequest = {
  id: string;
  dog: string;
  owner: string;
  zone: string;
  when: string;
  offerCop: number;
};

export const WEATHER_SAMPLE = {
  city: "Pasto",
  temperature: 14,
  summary: "Parcialmente nublado",
  hours: [
    { label: "Ahora", temperature: 14, icon: "cloud" },
    { label: "12 pm", temperature: 17, icon: "sun" },
    { label: "3 pm", temperature: 16, icon: "cloud" },
    { label: "6 pm", temperature: 13, icon: "cloud" },
    { label: "9 pm", temperature: 10, icon: "moon" },
  ],
} as const;

export const OWNER_WALKS: SampleWalk[] = [
  { id: "w1", title: "Paseo de Luna", detail: "Parque Infantil · 45 min", when: "Hoy, 5:00 pm" },
  { id: "w2", title: "Paseo de Luna", detail: "Plaza de Nariño · 30 min", when: "Mañana, 7:30 am" },
  { id: "w3", title: "Paseo de Luna", detail: "Río Pasto · 60 min", when: "Sáb, 9:00 am" },
];

export const WALKER_REQUESTS: SampleRequest[] = [
  { id: "r1", dog: "Luna", owner: "Camila R.", zone: "Centro", when: "Hoy, 5:00 pm", offerCop: 15000 },
  { id: "r2", dog: "Max", owner: "Andrés P.", zone: "Torobajo", when: "Hoy, 6:30 pm", offerCop: 12000 },
  { id: "r3", dog: "Nala", owner: "Laura G.", zone: "Los Rosales", when: "Mañana, 8:00 am", offerCop: 18000 },
];

export const WALK_DURATIONS = [30, 45, 60] as const;
export const PRICE_STEP_COP = 1000;
export const PRICE_MIN_COP = 8000;
export const PRICE_MAX_COP = 60000;

/** 15000 -> "$15.000" (Colombian pesos, dot as thousands separator). */
export function formatCop(value: number): string {
  return `$${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Suggested fare for a walk of the given length, rounded to the price step. */
export function suggestedFare(minutes: number): number {
  return Math.max(PRICE_MIN_COP, Math.round((minutes * 330) / PRICE_STEP_COP) * PRICE_STEP_COP);
}
