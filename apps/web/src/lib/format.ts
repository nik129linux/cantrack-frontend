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
