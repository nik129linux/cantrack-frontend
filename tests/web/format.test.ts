import { describe, it, expect } from "vitest";

// S2 polish item 3 (docs/design/POLISH-BACKLOG.md): no raw ISO strings in the
// walker screens — times are formatted with Intl.DateTimeFormat in the user's
// locale. The contract is a single shared helper so every screen formats
// identically: formatWhen(iso) === new Intl.DateTimeFormat(undefined,
// { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)).
// The expected value is computed with Intl inside the test, so it stays
// deterministic in any locale/environment.
//
// Red until apps/web/src/lib/format.ts exists (runtime-computed specifier so
// each test fails on its own).

function loadFormat(): Promise<any> {
  return import(/* @vite-ignore */ "../../apps/web/src/lib/format.js");
}

describe("formatWhen (S2 polish item 3)", () => {
  it("matches Intl.DateTimeFormat with dateStyle medium and timeStyle short", async () => {
    const { formatWhen } = await loadFormat();
    const iso = "2026-10-05T10:00:00.000Z";
    const expected = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
    expect(formatWhen(iso)).toBe(expected);
  });

  it("formats offset timestamps the same instant as their UTC form", async () => {
    const { formatWhen } = await loadFormat();
    expect(formatWhen("2026-10-05T10:00:00+00:00")).toBe(
      formatWhen("2026-10-05T10:00:00.000Z"),
    );
    expect(formatWhen("2026-10-05T05:00:00-05:00")).toBe(
      formatWhen("2026-10-05T10:00:00.000Z"),
    );
  });

  it("never leaks the raw ISO string", async () => {
    const { formatWhen } = await loadFormat();
    const iso = "2026-10-05T10:00:00.000Z";
    const formatted = formatWhen(iso);
    expect(formatted).not.toContain("T10:00:00");
    expect(formatted).not.toContain("2026-10-05T");
    expect(formatted).not.toMatch(/Z$|\+00:00$/);
  });
});
