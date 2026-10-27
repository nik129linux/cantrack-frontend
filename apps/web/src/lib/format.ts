/**
 * Locale-aware time formatting (S2, polish item 3).
 *
 * Walker screens never render raw ISO timestamps: every visible time goes
 * through `formatWhen`, while machine-readable values stay in attributes
 * like `<time dateTime>`. The contract is pinned by tests/web/format.test.ts:
 * exactly `Intl.DateTimeFormat(undefined, { dateStyle: "medium",
 * timeStyle: "short" })`.
 */

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Format an ISO-8601 timestamp for display in the user's locale. Values that
 * are not parseable dates (missing or malformed data) are returned as-is
 * rather than throwing — a broken row must not blank the whole screen.
 */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return formatter.format(date);
}

const BOGOTA = "America/Bogota";

const bogotaWhen = new Intl.DateTimeFormat("es-CO", {
  timeZone: BOGOTA,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const bogotaHour = new Intl.DateTimeFormat("es-CO", {
  timeZone: BOGOTA,
  hour: "numeric",
  minute: "2-digit",
});

const bogotaDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: BOGOTA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** "$15.000" */
export function formatCop(value: number): string {
  return cop.format(value);
}

/** "lun, 26 oct, 5:00 p. m." in Bogota time; the raw value if it is not a date. */
export function formatWhenBogota(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : bogotaWhen.format(date);
}

/** "5:00 p. m." in Bogota time. */
export function formatHourBogota(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : bogotaHour.format(date);
}

/** The Bogota calendar day as YYYY-MM-DD. */
export function bogotaDate(date: Date = new Date()): string {
  return bogotaDay.format(date);
}

/** "hace 3 días" / "hoy" for a past timestamp. */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) {
    return "hoy";
  }
  return days === 1 ? "ayer" : `hace ${days} días`;
}
