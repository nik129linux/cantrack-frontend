// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// S1: the 8-field questionnaire (dogs.profile) gets an additive editor inside
// the existing OwnerDogsScreen — a "Questionnaire" action per dog opening
// labeled fields (3 selects, 1 checkbox, 4 optional texts) that saves through
// saveDogProfile(dogId, profile) with the exact DTO. The existing enrollment
// flow and its tests (tests/web/owner-dogs.test.tsx) are untouched; this file
// only covers the new behavior.

const mockFetchDogs = vi.fn();
const mockCreateDog = vi.fn();
const mockEnrollPhotos = vi.fn();
const mockSaveDogProfile = vi.fn();
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchDogs: mockFetchDogs,
  createDog: mockCreateDog,
  enrollPhotos: mockEnrollPhotos,
  saveDogProfile: mockSaveDogProfile,
}));

async function importScreen() {
  return import("../../apps/web/src/owner/OwnerDogsScreen.js");
}

afterEach(cleanup);

describe("Owner dogs screen — questionnaire (S1)", () => {
  beforeEach(() => {
    mockFetchDogs.mockReset();
    mockCreateDog.mockReset();
    mockEnrollPhotos.mockReset();
    mockSaveDogProfile.mockReset();
    mockFetchDogs.mockResolvedValue([{ id: "dog-1", name: "Firulais", breed: "Mixed" }]);
  });

  it("opens a questionnaire panel with the 8 labeled fields and exact options", async () => {
    const { OwnerDogsScreen } = await importScreen();
    const user = userEvent.setup();
    render(<OwnerDogsScreen />);

    await user.click(await screen.findByRole("button", { name: "Questionnaire" }));

    expect(
      await screen.findByRole("heading", { name: "Questionnaire for Firulais" }),
    ).toBeInTheDocument();

    const size = screen.getByLabelText("Size");
    expect(within(size).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "", "small", "medium", "large",
    ]);
    const temperament = screen.getByLabelText("Temperament");
    expect(within(temperament).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "", "friendly", "shy", "reactive",
    ]);
    const energy = screen.getByLabelText("Energy");
    expect(within(energy).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "", "low", "medium", "high",
    ]);
    expect(screen.getByLabelText("Leash trained")).toBeInTheDocument();
    expect(screen.getByLabelText("Allergies")).toBeInTheDocument();
    expect(screen.getByLabelText("Medical notes")).toBeInTheDocument();
    expect(screen.getByLabelText("Vet contact")).toBeInTheDocument();
    expect(screen.getByLabelText("Emergency contact")).toBeInTheDocument();
  });

  it("saves the exact questionnaire DTO (empty texts become null)", async () => {
    mockSaveDogProfile.mockResolvedValue({});
    const { OwnerDogsScreen } = await importScreen();
    const user = userEvent.setup();
    render(<OwnerDogsScreen />);

    await user.click(await screen.findByRole("button", { name: "Questionnaire" }));
    await user.selectOptions(await screen.findByLabelText("Size"), "medium");
    await user.selectOptions(screen.getByLabelText("Temperament"), "friendly");
    await user.selectOptions(screen.getByLabelText("Energy"), "high");
    await user.click(screen.getByLabelText("Leash trained"));
    await user.type(screen.getByLabelText("Medical notes"), "Hip dysplasia");
    await user.type(screen.getByLabelText("Vet contact"), "Vet Laura");
    await user.type(screen.getByLabelText("Emergency contact"), "Ana");
    await user.click(screen.getByRole("button", { name: "Save questionnaire" }));

    await waitFor(() =>
      expect(mockSaveDogProfile).toHaveBeenCalledWith("dog-1", {
        size: "medium",
        temperament: "friendly",
        energy: "high",
        leashTrained: true,
        allergies: null,
        medicalNotes: "Hip dysplasia",
        vetContact: "Vet Laura",
        emergencyContact: "Ana",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Questionnaire saved.");
  });

  it("rejects saving without size, temperament and energy", async () => {
    const { OwnerDogsScreen } = await importScreen();
    const user = userEvent.setup();
    render(<OwnerDogsScreen />);

    await user.click(await screen.findByRole("button", { name: "Questionnaire" }));
    await user.click(await screen.findByRole("button", { name: "Save questionnaire" }));

    expect(
      await screen.findByText("Choose size, temperament and energy."),
    ).toBeInTheDocument();
    expect(mockSaveDogProfile).not.toHaveBeenCalled();
  });

  it("shows the API error inline when saving fails", async () => {
    mockSaveDogProfile.mockRejectedValue(new Error("Dog not found."));
    const { OwnerDogsScreen } = await importScreen();
    const user = userEvent.setup();
    render(<OwnerDogsScreen />);

    await user.click(await screen.findByRole("button", { name: "Questionnaire" }));
    await user.selectOptions(await screen.findByLabelText("Size"), "small");
    await user.selectOptions(screen.getByLabelText("Temperament"), "shy");
    await user.selectOptions(screen.getByLabelText("Energy"), "low");
    await user.click(screen.getByRole("button", { name: "Save questionnaire" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Dog not found.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
