// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ART } from "../../apps/web/src/art.js";
import { InteractiveMascot } from "../../apps/web/src/ui/InteractiveMascot.js";

describe("InteractiveMascot", () => {
  it("renders an accessible mascot control that reacts to activation", async () => {
    const user = userEvent.setup();
    render(<InteractiveMascot character="dog" label="Play with the dog" />);

    const mascot = screen.getByRole("button", { name: "Play with the dog" });
    expect(mascot.querySelector("img")).toHaveAttribute("src", ART.dog);

    await user.click(mascot);

    expect(mascot).toHaveClass("ui-mascot--bounce");
    expect(mascot).not.toHaveStyle({ "--mx": "NaNpx" });
  });

  it("hides decorative artwork from assistive technology", () => {
    const { container } = render(
      <InteractiveMascot character="walker" decorative size={64} />,
    );

    expect(container.querySelector(".ui-mascot")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("img")).toHaveAttribute("src", ART.walker);
    expect(within(container).queryByRole("button")).not.toBeInTheDocument();
  });
});
