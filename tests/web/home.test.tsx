// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Home panel (sample data for now): navigation, the owner's fare offer
// (inDrive style: owner proposes the price) and the walker's accept/decline.
// The animated city needs ResizeObserver/canvas-free DOM only, so it is stubbed.

vi.mock("../../apps/web/src/city/CityScene.js", () => ({
  CityScene: () => <div data-testid="city" />,
}));

async function importHome() {
  return import("../../apps/web/src/home/HomeDashboard.js");
}

describe("formatCop and suggestedFare", () => {
  it("formats Colombian pesos with dots", async () => {
    const { formatCop } = await import("../../apps/web/src/home/sampleData.js");
    expect(formatCop(0)).toBe("$0");
    expect(formatCop(950)).toBe("$950");
    expect(formatCop(15000)).toBe("$15.000");
    expect(formatCop(1250000)).toBe("$1.250.000");
  });

  it("suggests a fare per duration, never below the minimum", async () => {
    const { suggestedFare } = await import("../../apps/web/src/home/sampleData.js");
    expect(suggestedFare(30)).toBe(10000);
    expect(suggestedFare(45)).toBe(15000);
    expect(suggestedFare(60)).toBe(20000);
    expect(suggestedFare(5)).toBe(8000);
  });
});

describe("Home panel — owner", () => {
  beforeEach(() => cleanup());

  it("greets the owner and shows the next walk, weather and city", async () => {
    const { HomeDashboard } = await importHome();
    render(<HomeDashboard role="owner" />);

    expect(screen.getByRole("heading", { name: "Hola, dueño", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Próximo paseo" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Clima en Pasto" })).toBeInTheDocument();
    expect(screen.getByTestId("city")).toBeInTheDocument();
  });

  it("marks exactly one navigation item as the current page and moves it on click", async () => {
    const { HomeDashboard } = await importHome();
    const user = userEvent.setup();
    render(<HomeDashboard role="owner" />);

    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Inicio",
      "Explorar",
      "Mis perros",
      "Paseos",
      "Perfil",
    ]);
    expect(within(nav).getByRole("button", { name: "Inicio" })).toHaveAttribute("aria-current", "page");

    await user.click(within(nav).getByRole("button", { name: "Paseos" }));

    expect(within(nav).getByRole("button", { name: "Paseos" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("starts at the suggested fare for 45 minutes and follows the chosen duration", async () => {
    const { HomeDashboard } = await importHome();
    const user = userEvent.setup();
    render(<HomeDashboard role="owner" />);

    const panel = screen.getByRole("region", { name: "Pedir un paseo" });
    expect(within(panel).getByRole("radio", { name: "45 min" })).toBeChecked();
    expect(within(panel).getByText("$15.000")).toBeInTheDocument();

    await user.click(within(panel).getByRole("radio", { name: "60 min" }));
    expect(within(panel).getByRole("radio", { name: "60 min" })).toBeChecked();
    expect(within(panel).getByText("$20.000")).toBeInTheDocument();
  });

  it("changes the offer in steps of $1.000 and stops at the limits", async () => {
    const { HomeDashboard } = await importHome();
    const user = userEvent.setup();
    render(<HomeDashboard role="owner" />);

    const panel = screen.getByRole("region", { name: "Pedir un paseo" });
    await user.click(within(panel).getByRole("button", { name: "Subir tarifa" }));
    expect(within(panel).getByText("$16.000")).toBeInTheDocument();

    for (let step = 0; step < 8; step += 1) {
      await user.click(within(panel).getByRole("button", { name: "Bajar tarifa" }));
    }
    expect(within(panel).getByText("$8.000")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Bajar tarifa" })).toBeDisabled();
  });

  it("confirms the exact offer after Buscar cuidador and clears it when the offer changes", async () => {
    const { HomeDashboard } = await importHome();
    const user = userEvent.setup();
    render(<HomeDashboard role="owner" />);

    const panel = screen.getByRole("region", { name: "Pedir un paseo" });
    expect(within(panel).queryByRole("status")).not.toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Buscar cuidador" }));
    expect(within(panel).getByRole("status")).toHaveTextContent(
      "Oferta de $15.000 por 45 min lista para enviar. (Vista previa: aún no hay cuidadores conectados.)",
    );

    await user.click(within(panel).getByRole("button", { name: "Subir tarifa" }));
    expect(within(panel).queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("Home panel — walker", () => {
  beforeEach(() => cleanup());

  it("greets the walker and lists the three sample requests with their offers", async () => {
    const { HomeDashboard } = await importHome();
    render(<HomeDashboard role="walker" />);

    expect(screen.getByRole("heading", { name: "Hola, cuidador", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Pedir un paseo" })).not.toBeInTheDocument();

    const requests = screen.getByRole("region", { name: "Solicitudes" });
    expect(within(requests).getAllByRole("listitem")).toHaveLength(3);
    expect(within(requests).getByText("Luna · $15.000")).toBeInTheDocument();
    expect(within(requests).getByText("Max · $12.000")).toBeInTheDocument();
    expect(within(requests).getByText("Nala · $18.000")).toBeInTheDocument();
  });

  it("accepts one request and declines another, only touching those rows", async () => {
    const { HomeDashboard } = await importHome();
    const user = userEvent.setup();
    render(<HomeDashboard role="walker" />);

    const requests = screen.getByRole("region", { name: "Solicitudes" });
    await user.click(within(requests).getByRole("button", { name: "Aceptar a Luna" }));
    await user.click(within(requests).getByRole("button", { name: "Rechazar a Max" }));

    expect(within(requests).getByText("Aceptada")).toBeInTheDocument();
    expect(within(requests).getByText("Rechazada")).toBeInTheDocument();
    expect(within(requests).queryByRole("button", { name: "Aceptar a Luna" })).not.toBeInTheDocument();
    expect(within(requests).queryByRole("button", { name: "Rechazar a Max" })).not.toBeInTheDocument();
    expect(within(requests).getByRole("button", { name: "Aceptar a Nala" })).toBeInTheDocument();
    expect(within(requests).getByRole("button", { name: "Rechazar a Nala" })).toBeInTheDocument();
  });
});
