// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceKeypad } from "../../apps/web/src/ui/PriceKeypad.js";

// The number pad that edits a fare by typing it (inDrive / Nequi style): the first digit replaces
// the current value, "000" adds three zeros, the backspace erases one digit, and "Listo" only
// works for an amount inside the limits that is a multiple of 100.

afterEach(cleanup);

function setup(over: Partial<Parameters<typeof PriceKeypad>[0]> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <PriceKeypad open title="Tu oferta" value={15000} min={8000} max={1_000_000} onConfirm={onConfirm} onClose={onClose} {...over} />,
  );
  return { onConfirm, onClose, user: userEvent.setup() };
}

const key = (name: string) => screen.getByRole("button", { name });
const amount = () => screen.getByTestId("keypad-amount").textContent;

describe("PriceKeypad", () => {
  it("renders nothing while closed", () => {
    render(<PriceKeypad open={false} title="Tu oferta" value={15000} min={8000} max={1_000_000} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the current value and the limits", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Tu oferta" })).toBeTruthy();
    expect(amount()).toBe("$15.000");
    expect(screen.getByText(/Mínimo \$8\.000/)).toBeTruthy();
    expect(screen.getByText(/máximo \$1\.000\.000/)).toBeTruthy();
  });

  it("the first digit replaces the current value, the next ones append", async () => {
    const { user } = setup();
    await user.click(key("2"));
    expect(amount()).toBe("$2");
    await user.click(key("3"));
    await user.click(key("5"));
    await user.click(key("0"));
    await user.click(key("0"));
    expect(amount()).toBe("$23.500");
  });

  it("000 adds three zeros and does nothing on an empty amount", async () => {
    const { user } = setup();
    await user.click(key("000"));
    expect(amount()).toBe("$0");
    await user.click(key("2"));
    await user.click(key("000"));
    expect(amount()).toBe("$2.000");
  });

  it("backspace erases one digit at a time", async () => {
    const { user } = setup();
    await user.click(key("Borrar"));
    expect(amount()).toBe("$1.500");
    await user.click(key("Borrar"));
    expect(amount()).toBe("$150");
  });

  it("does not take a leading zero or more than seven digits", async () => {
    const { user } = setup();
    await user.click(key("0"));
    expect(amount()).toBe("$0");
    for (const digit of ["9", "9", "9", "9", "9", "9", "9", "9"]) await user.click(key(digit));
    expect(amount()).toBe("$9.999.999");
  });

  it("Listo confirms a valid amount", async () => {
    const { user, onConfirm } = setup();
    await user.click(key("2"));
    await user.click(key("3"));
    await user.click(key("5"));
    await user.click(key("0"));
    await user.click(key("0"));
    await user.click(key("Listo"));
    expect(onConfirm).toHaveBeenCalledWith(23500);
  });

  it.each([
    ["7", /Mínimo \$8\.000/],
    ["8050", /múltiplo de \$100/],
  ])("Listo is disabled and says why for %s", async (typed, reason) => {
    const { user, onConfirm } = setup();
    for (const digit of typed) await user.click(key(digit));
    if (typed === "7") await user.click(key("000"));
    const done = key("Listo") as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(reason);
    await user.click(done);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Listo is disabled above the maximum", async () => {
    const { user } = setup({ max: 30000 });
    await user.click(key("4"));
    await user.click(key("000"));
    await user.click(key("0"));
    expect((key("Listo") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/Máximo \$30\.000/);
  });

  it("the physical keyboard types, erases and confirms with Enter", async () => {
    const { user, onConfirm } = setup();
    await user.keyboard("23700");
    expect(amount()).toBe("$23.700");
    await user.keyboard("{Backspace}{Backspace}");
    expect(amount()).toBe("$237");
    await user.keyboard("00{Enter}");
    expect(onConfirm).toHaveBeenCalledWith(23700);
  });

  it("Escape closes without confirming", async () => {
    const { user, onClose, onConfirm } = setup();
    await user.click(key("9"));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("opens again from the saved value, not from what was typed before", () => {
    const { rerender } = render(
      <PriceKeypad open title="Tu oferta" value={15000} min={8000} max={1_000_000} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    rerender(<PriceKeypad open={false} title="Tu oferta" value={15000} min={8000} max={1_000_000} onConfirm={vi.fn()} onClose={vi.fn()} />);
    rerender(<PriceKeypad open title="Tu oferta" value={20000} min={8000} max={1_000_000} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(amount()).toBe("$20.000");
  });
});
