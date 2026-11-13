// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Dog, DogProfile } from "../../apps/web/src/lib/api.js";

const api = vi.hoisted(() => ({
  fetchDogs: vi.fn(),
  createDog: vi.fn(),
  updateDog: vi.fn(),
  deleteDog: vi.fn(),
  enrollPhotos: vi.fn(),
  suggestDogTraits: vi.fn(),
  saveDogProfile: vi.fn(),
  fetchTimeline: vi.fn(),
}));
vi.mock("../../apps/web/src/lib/api.js", () => api);
vi.mock("../../apps/web/src/lib/image.js", () => ({ resizeImage: vi.fn(async (file: File) => file) }));
import { OwnerDogsScreen } from "../../apps/web/src/owner/OwnerDogsScreen.js";

const profile: DogProfile = {
  size: "medium",
  temperament: "shy",
  energy: "low",
  leashTrained: true,
  allergies: "Pollo",
  medicalNotes: "Cuidar la cadera",
  vetContact: "Vet Laura",
  emergencyContact: "Ana",
};
const dog: Dog = {
  id: "dog-1",
  name: "Luna",
  breed: "Criollo",
  notes: "Evitar motos",
  hasPhotos: false,
  profile,
};
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchDogs.mockResolvedValue([dog]);
  api.updateDog.mockImplementation(async (_id, patch) => ({ ...dog, ...patch }));
  api.saveDogProfile.mockImplementation(async (_id, value) => value);
  api.fetchTimeline.mockResolvedValue([]);
  api.deleteDog.mockResolvedValue(undefined);
});

async function openFicha(section?: string) {
  const user = userEvent.setup();
  const onGo = vi.fn();
  render(<OwnerDogsScreen onGo={onGo} />);
  await user.click(await screen.findByRole("button", { name: /Luna/ }));
  if (section) {
    await user.click(screen.getByText(section, { selector: "summary > span" }));
  }
  return { user, onGo };
}

describe("Datos", () => {
  it.each([false, true])("PATCHes the exact body (empty optional fields: %s)", async (empty) => {
    const { user } = await openFicha();
    const name = screen.getByLabelText("Nombre");
    const breed = screen.getByLabelText("Raza");
    const notes = screen.getByLabelText("Indicaciones para el paseador");
    expect(name).toHaveValue("Luna");
    expect(breed).toHaveValue("Criollo");
    expect(notes).toHaveValue("Evitar motos");
    expect(notes).toHaveAttribute("placeholder", "Le dan miedo las motos; no lo sueltes en el parque…");
    await user.clear(name);
    await user.type(name, " Luna nueva ");
    await user.clear(breed);
    await user.type(breed, empty ? " " : " Labrador ");
    await user.clear(notes);
    await user.type(notes, empty ? " " : " No soltar ");
    const form = name.closest("form")!;
    await user.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(api.updateDog).toHaveBeenCalledExactlyOnceWith("dog-1", {
        name: "Luna nueva",
        breed: empty ? null : "Labrador",
        notes: empty ? null : "No soltar",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Datos guardados");
  });
});

describe("Carácter y salud", () => {
  it("prefills exactly six controls and routes contact editing to Perfil", async () => {
    const { user, onGo } = await openFicha("Carácter y salud");
    const form = screen.getByLabelText("Alergias").closest("form")!;
    const fields = within(form);
    expect(fields.getAllByRole("radiogroup")).toHaveLength(3);
    expect(fields.getAllByRole("switch")).toHaveLength(1);
    expect(fields.getAllByRole("textbox")).toHaveLength(2);
    expect(form.querySelectorAll("input, textarea, select")).toHaveLength(3);
    for (const [group, saved] of [
      ["Tamaño", "Mediano"],
      ["Temperamento", "Tímido"],
      ["Energía", "Baja"],
    ]) {
      expect(
        within(fields.getByRole("radiogroup", { name: group })).getByRole("radio", { name: saved }),
      ).toHaveAttribute("aria-checked", "true");
    }
    expect(fields.getByRole("switch", { name: "Camina bien con correa" })).toBeChecked();
    expect(fields.getByLabelText("Alergias")).toHaveValue("Pollo");
    expect(fields.getByLabelText("Notas médicas")).toHaveValue("Cuidar la cadera");
    expect(fields.getByLabelText("Alergias")).toHaveAttribute("maxlength", "500");
    expect(fields.getByLabelText("Notas médicas")).toHaveAttribute("maxlength", "500");
    expect(
      fields.queryByRole("textbox", { name: /veterinario|emergencia|vet|emergency/i }),
    ).not.toBeInTheDocument();
    await user.click(fields.getByRole("button", { name: "Ir a Perfil" }));
    expect(onGo).toHaveBeenCalledExactlyOnceWith("profile");
  });

  it("saves six fields and preserves the stored contacts unchanged", async () => {
    const { user } = await openFicha("Carácter y salud");
    await user.click(screen.getByRole("radio", { name: "Grande" }));
    await user.click(screen.getByRole("radio", { name: "Amigable" }));
    await user.click(screen.getByRole("radio", { name: "Alta" }));
    await user.click(screen.getByRole("switch"));
    await user.clear(screen.getByLabelText("Alergias"));
    await user.type(screen.getByLabelText("Alergias"), " ");
    await user.clear(screen.getByLabelText("Notas médicas"));
    await user.type(screen.getByLabelText("Notas médicas"), " Revisar cadera ");
    const form = screen.getByLabelText("Alergias").closest("form")!;
    await user.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(api.saveDogProfile).toHaveBeenCalledExactlyOnceWith("dog-1", {
        size: "large",
        temperament: "friendly",
        energy: "high",
        leashTrained: false,
        allergies: null,
        medicalNotes: "Revisar cadera",
        vetContact: "Vet Laura",
        emergencyContact: "Ana",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Ficha guardada");
  });

  it("validates the required choices", async () => {
    api.fetchDogs.mockResolvedValue([{ ...dog, profile: null }]);
    const { user } = await openFicha("Carácter y salud");
    const form = screen.getByLabelText("Alergias").closest("form")!;
    await user.click(within(form).getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige tamaño, temperamento y energía");
    expect(api.saveDogProfile).not.toHaveBeenCalled();
  });

  it("shows an API save error", async () => {
    api.saveDogProfile.mockRejectedValue(new Error("Dog not found."));
    const { user } = await openFicha("Carácter y salud");
    const form = screen.getByLabelText("Alergias").closest("form")!;
    await user.click(within(form).getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No encontramos a ese perro.");
  });

  it("moves selection and focus with ArrowRight in a radiogroup", async () => {
    const { user } = await openFicha("Carácter y salud");
    screen.getByRole("radio", { name: "Mediano" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Grande" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Grande" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Mediano" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("Diario and deletion", () => {
  it("fetches only when opened, shows at most three entries and caches on reopening", async () => {
    api.fetchTimeline.mockResolvedValue(
      [1, 2, 3, 4].map((id) => ({
        type: "walk",
        requestId: String(id),
        walkerId: String(id),
        walkerName: "Paseador " + id,
        requestedTime: "2026-11-12T12:00:00Z",
        status: "completed",
      })),
    );
    const { user, onGo } = await openFicha();
    expect(api.fetchTimeline).not.toHaveBeenCalled();
    await user.click(screen.getByText("Diario"));
    expect(await screen.findByText("Paseo con Paseador 1")).toBeInTheDocument();
    const diary = within(screen.getByText("Diario").closest("details")!);
    expect(diary.getAllByRole("listitem")).toHaveLength(3);
    expect(diary.queryByText("Paseo con Paseador 4")).not.toBeInTheDocument();
    await user.click(screen.getByText("Diario"));
    await user.click(screen.getByText("Diario"));
    expect(api.fetchTimeline).toHaveBeenCalledExactlyOnceWith("dog-1", "desc");
    await user.click(diary.getByRole("button", { name: "Ver todos en Paseos" }));
    expect(onGo).toHaveBeenCalledExactlyOnceWith("walks");
  });

  it("shows the empty diary", async () => {
    await openFicha("Diario");
    expect(await screen.findByText("Todavía no hay paseos de Luna")).toBeInTheDocument();
  });

  it("requires confirmation, allows cancellation, and removes the deleted dog", async () => {
    const { user } = await openFicha("Eliminar perro");
    await user.click(screen.getByRole("button", { name: "Eliminar perro" }));
    expect(screen.getByText("¿Eliminar a Luna? Esta acción no se puede deshacer.")).toBeInTheDocument();
    expect(api.deleteDog).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("button", { name: "Sí, eliminar" })).not.toBeInTheDocument();
    expect(api.deleteDog).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Eliminar perro" }));
    await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    expect(
      await screen.findByText("Aún no tienes perros. Agrega el primero para pedir paseos."),
    ).toBeInTheDocument();
    expect(api.deleteDog).toHaveBeenCalledExactlyOnceWith("dog-1");
    expect(screen.queryByRole("button", { name: /Luna/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ficha de Luna" })).not.toBeInTheDocument();
  });
});
