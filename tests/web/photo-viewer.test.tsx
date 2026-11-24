// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { PhotoGallery } from "../../apps/web/src/ui/PhotoGallery.js";
afterEach(cleanup);
describe("Dog photo viewer", () => {
  it("opens the selected image, navigates and closes with Escape, restoring focus", async () => {
    const user = userEvent.setup();
    render(<PhotoGallery photos={["/first.webp", "/second.webp"]} name="Siete" />);
    const opener = screen.getByRole("button", { name: "Ampliar foto 1 de Siete" });
    await user.click(opener);
    expect(screen.getByRole("dialog", { name: "Fotos de Siete" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Foto 1 ampliada de Siete" })).toHaveAttribute("src", "/first.webp");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("img", { name: "Foto 2 ampliada de Siete" })).toHaveAttribute("src", "/second.webp");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
  it("offers a retry when the enlarged image cannot be loaded", async () => {
    const user = userEvent.setup();
    render(<PhotoGallery photos={["/first.webp"]} name="Siete" />);
    await user.click(screen.getByRole("button", { name: "Ampliar foto 1 de Siete" }));
    fireEvent.error(screen.getByRole("img", { name: "Foto 1 ampliada de Siete" }));
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar esta foto");
    await user.click(screen.getByRole("button", { name: "Reintentar foto" }));
    expect(screen.getByRole("img", { name: "Foto 1 ampliada de Siete" })).toBeInTheDocument();
  });
});
