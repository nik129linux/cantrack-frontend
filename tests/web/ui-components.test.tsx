// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// S0 — UI kit components (docs/design/DESIGN.md, "Components to build in S0").
//
// Thirteen presentational components under apps/web/src/ui/: Button, Card,
// ListRow, Pill, StatTile, Banner, PetTile, Avatar, BottomNav, EmptyState,
// Sheet, Toast, Badge.
//
// Components are loaded through loadUi(), which computes the import specifier
// at RUNTIME. A static string literal (`await import(".../Button.js")`) is
// resolved by Vite at transform time, so a single missing module would fail
// the whole file as one collection error and no test would run individually.
// With the runtime specifier each test fails (red now) or passes (green in
// PR 2) on its own, per component.
//
// These assert the component *contract* the S0 implementation must satisfy:
// exact accessible names, ARIA state, the data attribute that carries each
// design token (tint / variant / tone / status), exact handler arguments and
// exact lifecycle timings. The kit is presentational — the S0 spec says "No
// new endpoints" — so there is no api.ts / network mocking here. Shell-level
// integration (role-based BottomNav inside App) is tested in
// tests/web/app-shell.test.tsx.
//
// The repo runs vitest without `globals: true`, so @testing-library/react does
// NOT auto-register cleanup; without the explicit afterEach below, renders
// would leak between tests and queries like queryByRole("button") would match
// elements from previous cases.

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadUi(name: string): Promise<any> {
  // @vite-ignore keeps Vite from trying to statically analyze the specifier;
  // the vitest module runner resolves it at runtime, relative to this file
  // (`.js` -> `.tsx` included), and applies the normal transform pipeline.
  return import(/* @vite-ignore */ `../../apps/web/src/ui/${name}.js`);
}

afterEach(cleanup);

describe("Button", () => {
  it("renders a button whose accessible name is its label and fires onClick once", async () => {
    const { Button } = await loadUi("Button");
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Start walk</Button>);

    await user.click(screen.getByRole("button", { name: "Start walk" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("exposes its variant via data-variant and defaults to primary", async () => {
    const { Button } = await loadUi("Button");
    const { rerender } = render(<Button>Default</Button>);
    expect(screen.getByRole("button", { name: "Default" })).toHaveAttribute("data-variant", "primary");

    rerender(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole("button", { name: "Secondary" })).toHaveAttribute("data-variant", "secondary");

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole("button", { name: "Ghost" })).toHaveAttribute("data-variant", "ghost");
  });

  it("is disabled and does not fire onClick when disabled", async () => {
    const { Button } = await loadUi("Button");
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type="button" and does NOT submit a surrounding form', async () => {
    const { Button } = await loadUi("Button");
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <Button>Cancel</Button>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toHaveAttribute("type", "button");
    await user.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the surrounding form when type="submit"', async () => {
    const { Button } = await loadUi("Button");
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Add dog</Button>
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Add dog" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("Card", () => {
  it("renders children and exposes its tint, defaulting to surface", async () => {
    const { Card } = await loadUi("Card");
    const { rerender } = render(<Card>Plain</Card>);
    expect(screen.getByText("Plain").closest("[data-tint]")).toHaveAttribute("data-tint", "surface");

    rerender(<Card tint="sage">Tinted</Card>);
    expect(screen.getByText("Tinted").closest("[data-tint]")).toHaveAttribute("data-tint", "sage");
  });
});

describe("ListRow", () => {
  it("shows the exact title and subtitle", async () => {
    const { ListRow } = await loadUi("ListRow");
    render(<ListRow title="Firulais" subtitle="Beagle · 2 stops" />);
    expect(screen.getByText("Firulais")).toBeInTheDocument();
    expect(screen.getByText("Beagle · 2 stops")).toBeInTheDocument();
  });

  it("is a button that fires onClick once when a handler is given", async () => {
    const { ListRow } = await loadUi("ListRow");
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<ListRow title="Today" subtitle="3 pickups" onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: /Today/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is not interactive when it has no onClick", async () => {
    const { ListRow } = await loadUi("ListRow");
    render(<ListRow title="Static" subtitle="No action" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Pill", () => {
  it("reflects its active state through aria-pressed and fires onClick", async () => {
    const { Pill } = await loadUi("Pill");
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Pill onClick={onClick}>All</Pill>);

    const pill = screen.getByRole("button", { name: "All" });
    expect(pill).toHaveAttribute("aria-pressed", "false");
    await user.click(pill);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Pill active onClick={onClick}>
        All
      </Pill>,
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("StatTile", () => {
  it("shows the exact label and value and its tone", async () => {
    const { StatTile } = await loadUi("StatTile");
    render(<StatTile label="Size" value="Medium" tone="lavender" />);
    expect(screen.getByText("Size")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Medium").closest("[data-tone]")).toHaveAttribute("data-tone", "lavender");
  });
});

describe("Banner", () => {
  it("shows its title as a heading, its subtitle, and fires the action", async () => {
    const { Banner } = await loadUi("Banner");
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <Banner title="Find a walker" subtitle="Near you" actionLabel="Search" onAction={onAction} />,
    );

    expect(screen.getByRole("heading", { name: "Find a walker" })).toBeInTheDocument();
    expect(screen.getByText("Near you")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe("PetTile", () => {
  // The tint rotation is part of the contract (DESIGN.md: "rotate through sage,
  // peach, lavender, sky, butter — hash of the dog id, stable"). The hash is
  // pinned exactly so a constant function or a different hash cannot pass:
  // tint = TINTS[sum of the UTF-16 char codes of the id % 5].
  const TINTS = ["sage", "peach", "lavender", "sky", "butter"];

  function tintBySpec(id: string): string {
    let sum = 0;
    for (const char of id) {
      sum += char.charCodeAt(0);
    }
    return TINTS[sum % TINTS.length] as string;
  }

  it("hashes the dog id to an exact tint: sum of UTF-16 char codes mod 5", async () => {
    const { petTintFor } = await loadUi("PetTile");
    expect(petTintFor("a")).toBe("lavender");
    expect(petTintFor("b")).toBe("sky");
    expect(petTintFor("c")).toBe("butter");
    expect(petTintFor("dog-1")).toBe("sky");
    expect(petTintFor("dog-7")).toBe("butter");
  });

  it("matches the pinned formula on 50 generated ids and uses all five tints", async () => {
    const { petTintFor } = await loadUi("PetTile");
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const id = `dog-${i}`;
      const tint = petTintFor(id);
      expect(tint).toBe(tintBySpec(id));
      seen.add(tint);
    }
    expect([...seen].sort()).toEqual([...TINTS].sort());
  });

  it("renders the dog name and applies petTintFor(dogId) as its tint", async () => {
    const { PetTile, petTintFor } = await loadUi("PetTile");
    render(<PetTile dogId="dog-7" name="Firulais" />);
    expect(screen.getByText("Firulais").closest("[data-tint]")).toHaveAttribute(
      "data-tint",
      petTintFor("dog-7"),
    );
  });

  it("replaces a broken pet image with a placeholder that keeps the accessible name", async () => {
    const { PetTile } = await loadUi("PetTile");
    const { container } = render(
      <PetTile dogId="dog-7" name="Firulais" imageSrc="/art/pets/dog-beagle.png" />,
    );

    const image = screen.getByRole("img", { name: "Firulais" });
    expect(image).toHaveAttribute("src", "/art/pets/dog-beagle.png");
    fireEvent.error(image);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Firulais" })).toBeInTheDocument();
  });
});

describe("Avatar", () => {
  it("renders an image with the exact alt and src when given a src", async () => {
    const { Avatar } = await loadUi("Avatar");
    render(<Avatar src="/art/avatars/walker-default.webp" alt="Nico" />);
    expect(screen.getByRole("img", { name: "Nico" })).toHaveAttribute(
      "src",
      "/art/avatars/walker-default.webp",
    );
  });

  it("still exposes the accessible name when there is no src (placeholder)", async () => {
    const { Avatar } = await loadUi("Avatar");
    render(<Avatar alt="Owner" />);
    expect(screen.getByRole("img", { name: "Owner" })).toBeInTheDocument();
  });

  it("replaces a broken image with a placeholder that keeps the accessible name", async () => {
    const { Avatar } = await loadUi("Avatar");
    const { container } = render(<Avatar src="/art/avatars/walker-default.webp" alt="Nico" />);

    fireEvent.error(screen.getByRole("img", { name: "Nico" }));

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Nico" })).toBeInTheDocument();
  });
});

describe("BottomNav", () => {
  it("renders the four walker tabs in order", async () => {
    const { BottomNav } = await loadUi("BottomNav");
    render(<BottomNav role="walker" active="Today" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("button").map((tab) => tab.textContent?.trim())).toEqual([
      "Today",
      "Clients",
      "Requests",
      "Profile",
    ]);
  });

  it("renders the four owner tabs in order", async () => {
    const { BottomNav } = await loadUi("BottomNav");
    render(<BottomNav role="owner" active="Discover" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("button").map((tab) => tab.textContent?.trim())).toEqual([
      "Discover",
      "My dogs",
      "Activity",
      "Profile",
    ]);
  });

  it("marks only the active tab with aria-current and fires onNavigate with the tab id", async () => {
    const { BottomNav } = await loadUi("BottomNav");
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<BottomNav role="walker" active="Today" onNavigate={onNavigate} />);
    const nav = screen.getByRole("navigation", { name: "Main" });

    expect(within(nav).getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const label of ["Clients", "Requests", "Profile"]) {
      expect(within(nav).getByRole("button", { name: label })).not.toHaveAttribute("aria-current");
    }

    await user.click(within(nav).getByRole("button", { name: "Clients" }));
    expect(onNavigate).toHaveBeenCalledWith("Clients");
  });
});

describe("EmptyState", () => {
  it("shows the title and message and fires the optional action", async () => {
    const { EmptyState } = await loadUi("EmptyState");
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState
        title="No dogs yet"
        message="Add your first dog to get started."
        actionLabel="Add a dog"
        onAction={onAction}
      />,
    );

    expect(screen.getByRole("heading", { name: "No dogs yet" })).toBeInTheDocument();
    expect(screen.getByText("Add your first dog to get started.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a dog" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe("Sheet", () => {
  it("renders nothing when closed", async () => {
    const { Sheet } = await loadUi("Sheet");
    render(
      <Sheet open={false} onClose={() => {}} title="Filters">
        body
      </Sheet>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders an aria-modal dialog named by its title, with its body", async () => {
    const { Sheet } = await loadUi("Sheet");
    render(
      <Sheet open onClose={() => {}} title="Filters">
        body
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("body")).toBeInTheDocument();
  });

  it("calls onClose from the close button and from Escape", async () => {
    const { Sheet } = await loadUi("Sheet");
    const onClose = vi.fn();
    const user = userEvent.setup();

    const first = render(
      <Sheet open onClose={onClose} title="Filters">
        body
      </Sheet>,
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    first.unmount();

    render(
      <Sheet open onClose={onClose} title="Filters">
        body
      </Sheet>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("moves focus inside on open, returns it to the trigger on close, and closes on backdrop click only", async () => {
    const { Sheet } = await loadUi("Sheet");
    const onClose = vi.fn();
    const user = userEvent.setup();

    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open filters
          </button>
          <Sheet
            open={open}
            title="Filters"
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          >
            body
          </Sheet>
        </>
      );
    }

    render(<Host />);
    const trigger = screen.getByRole("button", { name: "Open filters" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Clicking inside the sheet must NOT close it.
    await user.click(within(dialog).getByText("body"));
    expect(onClose).not.toHaveBeenCalled();

    // Clicking the backdrop DOES close it and focus returns to the trigger.
    const backdrop = document.querySelector("[data-backdrop]");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Open filters" })).toHaveFocus();
  });

  it("traps Tab focus: tabbing from the last focusable element wraps to the first", async () => {
    const { Sheet } = await loadUi("Sheet");
    const user = userEvent.setup();

    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open filters
          </button>
          <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
            <button type="button">First action</button>
            <button type="button">Last action</button>
          </Sheet>
        </>
      );
    }

    render(<Host />);
    await user.click(screen.getByRole("button", { name: "Open filters" }));
    const dialog = await screen.findByRole("dialog", { name: "Filters" });

    // The tabbable elements inside the dialog, in DOM order (the dialog itself
    // and any tabIndex={-1} element are excluded, same list a trap must use).
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    // close button + the two children buttons (harness sanity guard)
    expect(focusables.length).toBeGreaterThanOrEqual(3);

    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;
    last.focus();
    expect(document.activeElement).toBe(last);

    // jsdom has no native Tab navigation and keyboard() does not move focus:
    // only the Sheet's own trap handler can wrap focus back to the first element.
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(first);
  });
});

describe("Toast", () => {
  it("announces a success message as a status live region", async () => {
    const { Toast } = await loadUi("Toast");
    render(<Toast message="Check-out sent" tone="success" />);
    expect(screen.getByRole("status")).toHaveTextContent("Check-out sent");
  });

  it("announces an error message as an alert", async () => {
    const { Toast } = await loadUi("Toast");
    render(<Toast message="Upload failed" tone="error" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Upload failed");
  });

  it("fires onDismiss when dismissed", async () => {
    const { Toast } = await loadUi("Toast");
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<Toast message="Saved" tone="success" onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses a success toast after exactly 4000 ms", async () => {
    const { Toast } = await loadUi("Toast");
    const onDismiss = vi.fn();
    vi.useFakeTimers();
    try {
      render(<Toast message="Saved" tone="success" onDismiss={onDismiss} />);
      act(() => {
        vi.advanceTimersByTime(3999);
      });
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an error toast until it is dismissed", async () => {
    const { Toast } = await loadUi("Toast");
    const onDismiss = vi.fn();
    vi.useFakeTimers();
    try {
      render(<Toast message="Upload failed" tone="error" onDismiss={onDismiss} />);
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(onDismiss).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent("Upload failed");

      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Badge", () => {
  it.each(["pending", "accepted", "declined", "cancelled", "draft", "sent"])(
    "shows the %s status text and exposes it via data-status",
    async (status) => {
      const { Badge } = await loadUi("Badge");
      render(<Badge status={status} />);
      expect(screen.getByText(status)).toHaveAttribute("data-status", status);
    },
  );

  it("renders a custom label while keeping the status for styling", async () => {
    const { Badge } = await loadUi("Badge");
    render(<Badge status="declined" label="Not accepted" />);
    expect(screen.getByText("Not accepted")).toHaveAttribute("data-status", "declined");
  });
});
