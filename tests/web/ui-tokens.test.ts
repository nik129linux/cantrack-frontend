import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// S0 — UI kit design tokens (docs/design/DESIGN.md).
//
// The kit's palette, radii, type scale, the base button rule and the
// cross-cutting a11y rules (green-700 focus ring, 44px minimum tap target,
// prefers-reduced-motion) live in a single stylesheet under apps/web/src/ui/.
// These are exact-value assertions on the committed CSS custom properties —
// the palette hexes are the ones Nico fixed in DESIGN.md, so they are asserted
// verbatim, never "contains". All custom properties must be declared inside a
// `:root { ... }` block (asserted by parsing that block, not the whole file).
//
// The stylesheet does not exist until the S0 implementation PR, so this suite
// is red first for the right reason (missing tokens file), per AGENTS.md.

const TOKENS_PATH = "apps/web/src/ui/tokens.css";

function readTokens(): string {
  return readFileSync(TOKENS_PATH, "utf8");
}

/**
 * Extract the inner text of the first balanced `{ ... }` block that follows a
 * match of `selector`, so declarations are asserted in the block they belong
 * to (`:root`, the primary-button rule, the reduced-motion media query).
 */
function extractBlock(css: string, selector: RegExp): string {
  const match = css.match(selector);
  if (match === null || match.index === undefined) {
    throw new Error(`Missing block ${selector} in ${TOKENS_PATH}`);
  }

  const open = css.indexOf("{", match.index);
  if (open === -1) {
    throw new Error(`Unclosed block ${selector} in ${TOKENS_PATH}`);
  }

  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") {
      depth += 1;
    } else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(open + 1, i);
      }
    }
  }

  throw new Error(`Unclosed block ${selector} in ${TOKENS_PATH}`);
}

/** Extract the exact declared value of a CSS custom property (trimmed). */
function tokenValue(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (match === null) {
    throw new Error(`Missing token ${name}`);
  }
  return match[1].trim();
}

/** The `:root { ... }` block — every design token must live inside it. */
function rootBlock(): string {
  return extractBlock(readTokens(), /:root\s*\{/);
}

describe("S0 design tokens — palette declared in :root (exact hex from docs/design/DESIGN.md)", () => {
  const palette: Record<string, string> = {
    "--c-sage": "#ADEBB3",
    "--c-green": "#45C55D",
    "--c-green-700": "#1F7A35",
    "--c-green-800": "#17612A",
    "--c-mint-wash": "#EAFBEC",
    "--c-bg": "#F4FAF3",
    "--c-surface": "#FFFFFF",
    "--c-ink": "#14301F",
    "--c-muted": "#4F6A58",
    "--c-peach": "#FFC9A8",
    "--c-orange": "#FF9F5A",
    "--c-lavender": "#C9B8F5",
    "--c-violet": "#7A5FD6",
    "--c-sky": "#A9DCF7",
    "--c-sky-700": "#1F6F9E",
    "--c-butter": "#FFE49A",
    "--c-coral": "#FF8F85",
    "--c-coral-700": "#C23A33",
  };

  it.each(Object.entries(palette))("%s is exactly %s inside :root", (name, hex) => {
    expect(tokenValue(rootBlock(), name).toLowerCase()).toBe(hex.toLowerCase());
  });
});

describe("S0 design tokens — radii, type scale and a11y tokens declared in :root", () => {
  it("defines the exact radii from DESIGN.md (cards 28, tiles 20, chips/pills and buttons 999)", () => {
    const root = rootBlock();
    expect(tokenValue(root, "--radius-card")).toBe("28px");
    expect(tokenValue(root, "--radius-tile")).toBe("20px");
    expect(tokenValue(root, "--radius-pill")).toBe("999px");
    expect(tokenValue(root, "--radius-button")).toBe("999px");
  });

  it("loads Nunito (600;700;800) and falls back to Avenir Next / system-ui", () => {
    const css = readTokens();
    // index.html is not an editable path, so the webfont is loaded from CSS.
    expect(css).toMatch(/@import\s+url\(/);
    expect(css).toMatch(/family=Nunito:wght@600;700;800/);
    expect(tokenValue(rootBlock(), "--font-family")).toBe(
      '"Nunito", "Avenir Next", system-ui, sans-serif',
    );
  });

  it("defines the exact type scale (title 28/800, section 18/700, body 16/600, caption 13/600)", () => {
    const root = rootBlock();
    expect(tokenValue(root, "--text-title")).toBe("28px");
    expect(tokenValue(root, "--weight-title")).toBe("800");
    expect(tokenValue(root, "--text-section")).toBe("18px");
    expect(tokenValue(root, "--weight-section")).toBe("700");
    expect(tokenValue(root, "--text-body")).toBe("16px");
    expect(tokenValue(root, "--weight-body")).toBe("600");
    expect(tokenValue(root, "--text-caption")).toBe("13px");
    expect(tokenValue(root, "--weight-caption")).toBe("600");
  });

  it("sets a 44px minimum tap target and a green-700 keyboard focus ring", () => {
    const root = rootBlock();
    expect(tokenValue(root, "--tap-target")).toBe("44px");
    expect(tokenValue(root, "--focus-ring-color")).toBe("var(--c-green-700)");
  });
});

// ---------------------------------------------------------------------------
// WCAG contrast, computed from the palette the stylesheet actually declares.
// DESIGN.md's table claims ink >= 4.5:1 on every light fill and white >= 4.5:1
// on green-700/800 (and warns: white on --c-green is 2.2:1 and FAILS). The
// numbers are recomputed here with the WCAG relative-luminance formula, so a
// wrong hex in tokens.css fails these tests instead of shipping unreadable UI.

function parseHexChannels(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : clean;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseHexChannels(hex).map((value) => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Read the exact declared hex of every palette token from :root. */
function declaredPalette(): Record<string, string> {
  const root = rootBlock();
  const palette: Record<string, string> = {};
  for (const name of [
    "--c-sage",
    "--c-green",
    "--c-green-700",
    "--c-green-800",
    "--c-mint-wash",
    "--c-bg",
    "--c-surface",
    "--c-ink",
    "--c-muted",
    "--c-peach",
    "--c-orange",
    "--c-lavender",
    "--c-violet",
    "--c-sky",
    "--c-sky-700",
    "--c-butter",
    "--c-coral",
    "--c-coral-700",
  ]) {
    palette[name] = tokenValue(root, name);
  }
  return palette;
}

describe("S0 contrast guarantees (WCAG AA, recomputed from tokens.css)", () => {
  it.each(["green", "sage", "peach", "orange", "lavender", "sky", "butter", "coral"])(
    "ink on --c-%s is at least 4.5:1",
    (tokenName) => {
      const palette = declaredPalette();
      expect(contrastRatio(palette["--c-ink"], palette[`--c-${tokenName}`])).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );

  it.each(["green-700", "green-800"])("white on --c-%s is at least 4.5:1", (tokenName) => {
    const palette = declaredPalette();
    expect(contrastRatio("#FFFFFF", palette[`--c-${tokenName}`])).toBeGreaterThanOrEqual(4.5);
  });

  it('styles [data-variant="primary"] buttons with ink text, never white', () => {
    const rule = extractBlock(readTokens(), /\[data-variant="primary"\]/);
    // Anchored so `background-color: var(--c-ink);` cannot satisfy the check.
    expect(rule).toMatch(/(^|[;{\s])color:\s*var\(--c-ink\)\s*;/);
    expect(rule).not.toMatch(/(^|[;{\s])color:\s*(#fff\b|#ffffff\b|white|var\(--c-surface\))/i);
  });
});

describe("S0 reduced motion", () => {
  it("zeroes animation and transition durations for * under prefers-reduced-motion", () => {
    const block = extractBlock(readTokens(), /@media \(prefers-reduced-motion: reduce\)/);
    expect(block).toMatch(/\*/);
    expect(block).toMatch(/animation-duration:\s*(0\.01ms|0s)(\s*!important)?\s*;/);
    expect(block).toMatch(/transition-duration:\s*(0\.01ms|0s)(\s*!important)?\s*;/);
  });
});

// Declaring the tokens is not enough — the stylesheet must apply them: the
// keyboard focus ring must be painted with --focus-ring-color on a
// :focus-visible rule, and the base button rule must carry the 44px tap target.

describe("S0 base rules — the a11y tokens are actually applied", () => {
  it("paints the keyboard focus ring with var(--focus-ring-color) on :focus-visible", () => {
    const rule = extractBlock(readTokens(), /:focus-visible/);
    expect(rule).toMatch(/(outline|box-shadow):[^;]*var\(--focus-ring-color\)/);
  });

  it("gives the base button rule the tap target as min-height and min-width", () => {
    const rule = extractBlock(readTokens(), /\[data-variant\]/);
    expect(rule).toMatch(/min-height:\s*var\(--tap-target\)\s*;/);
    expect(rule).toMatch(/min-width:\s*var\(--tap-target\)\s*;/);
  });
});
