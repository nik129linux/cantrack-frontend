// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// S1: the walker's public profile form (Profile tab). It preloads the catalog
// (fetchWalkerProfiles), finds the caller's own entry by userId, and saves
// through saveWalkerProfile with the exact DTO. Every field has a real label
// (getByLabelText), there are loading / error / success states, and an empty
// display name is a client-side validation error that never reaches the API.

const mockFetchWalkerProfiles = vi.fn();
const mockSaveWalkerProfile = vi.fn();
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchWalkerProfiles: mockFetchWalkerProfiles,
  saveWalkerProfile: mockSaveWalkerProfile,
}));

function loadScreen(path: string): Promise<any> {
  return import(/* @vite-ignore */ `../../apps/web/src/${path}.js`);
}

async function renderProfile() {
  const { WalkerProfileScreen } = await loadScreen("walker/WalkerProfileScreen");
  return render(<WalkerProfileScreen userId="walker-w" />);
}

const OWN = {
  walkerId: "walker-w",
  displayName: "Nico Walks",
  bio: "Five years walking packs.",
  serviceArea: "Laureles",
  pricePerWalk: 25000,
};

const OTHER = {
  walkerId: "walker-w2",
  displayName: "Ana Packs",
  bio: null,
  serviceArea: "El Poblado",
  pricePerWalk: 18000,
};

afterEach(cleanup);

describe("Walker profile screen (S1)", () => {
  beforeEach(() => {
    mockFetchWalkerProfiles.mockReset();
    mockSaveWalkerProfile.mockReset();
    mockFetchWalkerProfiles.mockResolvedValue([]);
  });

  it("shows a loading state while the profile loads", async () => {
    mockFetchWalkerProfiles.mockReturnValue(new Promise(() => {}));
    await renderProfile();
    expect(screen.getByText("Loading profile...")).toBeInTheDocument();
  });

  it("preloads the caller's own profile, not someone else's", async () => {
    mockFetchWalkerProfiles.mockResolvedValue([OTHER, OWN]);
    await renderProfile();

    await waitFor(() =>
      expect(screen.getByLabelText("Display name")).toHaveValue("Nico Walks"),
    );
    expect(screen.getByLabelText("Bio")).toHaveValue("Five years walking packs.");
    expect(screen.getByLabelText("Service area")).toHaveValue("Laureles");
    expect(screen.getByLabelText("Price per walk (COP)")).toHaveValue(25000);
  });

  it("saves the exact DTO", async () => {
    mockFetchWalkerProfiles.mockResolvedValue([OWN]);
    mockSaveWalkerProfile.mockResolvedValue(OWN);
    const user = userEvent.setup();
    await renderProfile();

    await waitFor(() =>
      expect(screen.getByLabelText("Display name")).toHaveValue("Nico Walks"),
    );
    await user.clear(screen.getByLabelText("Price per walk (COP)"));
    await user.type(screen.getByLabelText("Price per walk (COP)"), "30000");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(mockSaveWalkerProfile).toHaveBeenCalledWith({
        displayName: "Nico Walks",
        bio: "Five years walking packs.",
        serviceArea: "Laureles",
        pricePerWalk: 30000,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Profile saved.");
  });

  it("rejects an empty display name without calling the API", async () => {
    mockFetchWalkerProfiles.mockResolvedValue([]);
    const user = userEvent.setup();
    await renderProfile();

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Display name is required.")).toBeInTheDocument();
    expect(mockSaveWalkerProfile).not.toHaveBeenCalled();
  });

  it("shows the API error inline when saving fails", async () => {
    mockFetchWalkerProfiles.mockResolvedValue([]);
    mockSaveWalkerProfile.mockRejectedValue(new Error("Price must be positive."));
    const user = userEvent.setup();
    await renderProfile();

    await user.type(screen.getByLabelText("Display name"), "Nico Walks");
    await user.type(screen.getByLabelText("Price per walk (COP)"), "25000");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Price must be positive.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the error inline when the catalog fails to load, with an empty form", async () => {
    mockFetchWalkerProfiles.mockRejectedValue(new Error("Boom"));
    await renderProfile();

    expect(await screen.findByRole("alert")).toHaveTextContent("Boom");
    expect(screen.getByLabelText("Display name")).toHaveValue("");
  });
});
