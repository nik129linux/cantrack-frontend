// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrivacyPage } from "../../apps/web/src/legal/PrivacyPage.js";

// /privacidad is the public privacy policy Google OAuth needs before the app can
// leave "Testing" mode, and the page the consent checkbox points to. It must
// render without a session, in Spanish, under Colombian law (Ley 1581 de 2012),
// and describe only data the app really collects.

afterEach(cleanup);

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Privacy page (/privacidad)", () => {
  it("renders the policy title as the only h1", () => {
    render(<PrivacyPage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/política de privacidad/i);
  });

  it("cites Colombian data-protection law", () => {
    render(<PrivacyPage />);
    expect(document.body.textContent).toMatch(/Ley 1581 de 2012/);
  });

  it("names the data the app actually collects", () => {
    render(<PrivacyPage />);
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const word of ["correo", "ubicación", "fotos", "perro", "teléfono"]) {
      expect(text).toContain(word);
    }
  });

  it("lists the four habeas data rights", () => {
    render(<PrivacyPage />);
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const right of ["conocer", "actualizar", "rectificar", "suprimir"]) {
      expect(text).toContain(right);
    }
  });

  it("has a section heading for each required part", () => {
    render(<PrivacyPage />);
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.toLowerCase() ?? "");
    for (const part of ["datos", "finalidad", "derechos", "contacto"]) {
      expect(h2.some((t) => t.includes(part)), `missing h2 about "${part}"`).toBe(true);
    }
  });

  it("invents no contact data: the contact email is a placeholder", () => {
    render(<PrivacyPage />);
    expect(document.body.textContent).toContain("[correo de contacto]");
  });

  it("links back to the app", () => {
    render(<PrivacyPage />);
    const back = screen.getByRole("link", { name: /volver/i });
    expect(back).toHaveAttribute("href", "/");
  });

  it("is mounted for /privacidad before the app shell, without a session", () => {
    const main = read("apps/web/src/main.tsx");
    expect(main).toMatch(/["']\/privacidad["']/);
    expect(main).toContain("PrivacyPage");
  });

  it("deploys as a real URL: Vercel rewrites every path to the SPA", () => {
    const config = JSON.parse(read("apps/web/vercel.json")) as { rewrites?: { source: string; destination: string }[] };
    expect(config.rewrites).toContainEqual({ source: "/(.*)", destination: "/index.html" });
  });
});
