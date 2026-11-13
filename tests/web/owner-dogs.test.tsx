// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Dog } from "../../apps/web/src/lib/api.js";
import { ApiError } from "../../apps/web/src/lib/apiError.js";

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
const resizeImage = vi.hoisted(() => vi.fn(async (file: File) => file));
vi.mock("../../apps/web/src/lib/image.js", () => ({ resizeImage }));
import { OwnerDogsScreen } from "../../apps/web/src/owner/OwnerDogsScreen.js";

const dog: Dog = { id: "dog-1", name: "Luna", breed: "Criollo", profile: null, hasPhotos: false };
const photos = () =>
  ["frente", "lado", "cuerpo"].map((name) => new File(["image"], name + ".png", { type: "image/png" }));

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchDogs.mockResolvedValue([dog]);
  api.enrollPhotos.mockResolvedValue(undefined);
  api.suggestDogTraits.mockResolvedValue({ breed: "Golden Retriever", size: "large" });
  api.updateDog.mockImplementation(async (_id, patch) => ({ ...dog, ...patch }));
  resizeImage.mockImplementation(async (file) => file);
});

async function openPhotos() {
  const user = userEvent.setup();
  render(<OwnerDogsScreen />);
  await user.click(await screen.findByRole("button", { name: /Luna/ }));
  await user.click(screen.getByText("Fotos de reconocimiento"));
  return user;
}

describe("Mis perros: list and creation", () => {
  it("lists breed, size and both status chips and offers a desktop placeholder", async () => {
    api.fetchDogs.mockResolvedValue([
      {
        ...dog,
        hasPhotos: true,
        profile: {
          size: "large",
          temperament: "friendly",
          energy: "high",
          leashTrained: true,
          allergies: null,
          medicalNotes: null,
          vetContact: null,
          emergencyContact: null,
        },
      },
      { ...dog, id: "dog-2", name: "Rex" },
    ]);
    render(<OwnerDogsScreen />);
    const luna = await screen.findByRole("button", { name: /Luna/ });
    expect(within(luna).getByText("Criollo · Grande")).toBeInTheDocument();
    expect(within(luna).getByText("Fotos listas")).toBeInTheDocument();
    expect(within(luna).getByText("Ficha completa")).toBeInTheDocument();
    const rex = screen.getByRole("button", { name: /Rex/ });
    expect(within(rex).getByText("Faltan fotos")).toBeInTheDocument();
    expect(within(rex).getByText("Ficha incompleta")).toBeInTheDocument();
    expect(screen.getByText("Elige un perro para ver su ficha")).toHaveClass(
      "glass",
      "dogs__card",
      "dogs__placeholder",
    );
  });

  it("shows the empty state without a placeholder", async () => {
    api.fetchDogs.mockResolvedValue([]);
    render(<OwnerDogsScreen />);
    expect(
      await screen.findByText("Aún no tienes perros. Agrega el primero para pedir paseos."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Elige un perro para ver su ficha")).not.toBeInTheDocument();
  });

  it("shows a load error and retries the request", async () => {
    api.fetchDogs.mockRejectedValueOnce(new Error("Unavailable"));
    const user = userEvent.setup();
    render(<OwnerDogsScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tus perros.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: /Luna/ })).toBeInTheDocument();
    expect(api.fetchDogs).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("requires a name, creates the dog, selects it and opens Fotos", async () => {
    api.fetchDogs.mockResolvedValue([]);
    api.createDog.mockResolvedValue({ ...dog, breed: "Poodle" });
    const user = userEvent.setup();
    render(<OwnerDogsScreen />);
    await screen.findByText("Aún no tienes perros. Agrega el primero para pedir paseos.");
    await user.click(screen.getByRole("button", { name: "Agregar perro" }));
    const form = screen.getByRole("form", { name: "Agregar perro" });
    expect(within(form).getByLabelText("Nombre")).toBeRequired();
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe el nombre de tu perro");
    expect(api.createDog).not.toHaveBeenCalled();
    await user.type(within(form).getByLabelText("Nombre"), " Luna ");
    await user.type(within(form).getByLabelText("Raza (opcional)"), " Poodle ");
    await user.click(within(form).getByRole("button", { name: "Guardar perro" }));
    const ficha = await screen.findByRole("region", { name: "Ficha de Luna" });
    expect(api.createDog).toHaveBeenCalledExactlyOnceWith({ name: "Luna", breed: "Poodle" });
    expect(screen.getByRole("button", { name: /Luna Poodle/ })).toHaveAttribute("aria-current", "true");
    expect(within(ficha).getByText("Fotos de reconocimiento").closest("details")).toHaveAttribute("open");
    expect(screen.queryByRole("form", { name: "Agregar perro" })).not.toBeInTheDocument();
  });
});

describe("Fotos de reconocimiento", () => {
  it.each([0, 1, 2, 4])("rejects %i photos", async (count) => {
    const user = await openPhotos();
    const files = [...photos(), new File(["image"], "extra.png", { type: "image/png" })].slice(0, count);
    await user.upload(screen.getByLabelText("Fotos de referencia (3)"), files);
    await user.click(screen.getByRole("button", { name: "Guardar fotos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige exactamente 3 fotos");
    expect(api.enrollPhotos).not.toHaveBeenCalled();
    expect(api.suggestDogTraits).not.toHaveBeenCalled();
  });

  it("enrolls the three original files before suggesting, then applies breed and size", async () => {
    let finishEnrollment!: () => void;
    api.enrollPhotos.mockReturnValue(
      new Promise<void>((resolve) => {
        finishEnrollment = resolve;
      }),
    );
    const user = await openPhotos();
    const files = photos();
    await user.upload(screen.getByLabelText("Fotos de referencia (3)"), files);
    await user.click(screen.getByRole("button", { name: "Guardar fotos" }));
    expect(api.enrollPhotos).toHaveBeenCalledExactlyOnceWith("dog-1", files);
    const uploaded = api.enrollPhotos.mock.calls[0]![1] as File[];
    files.forEach((file, index) => expect(uploaded[index]).toBe(file));
    expect(api.suggestDogTraits).not.toHaveBeenCalled();
    finishEnrollment();
    const suggestion = await screen.findByRole("complementary", { name: "Sugerencia de la IA" });
    expect(resizeImage).toHaveBeenCalledExactlyOnceWith(files[0]);
    expect(api.suggestDogTraits).toHaveBeenCalledExactlyOnceWith("dog-1", files[0]);
    expect(within(suggestion).getByText("Golden Retriever · Grande")).toBeInTheDocument();
    await user.click(within(suggestion).getByRole("button", { name: "Usar" }));
    await waitFor(() =>
      expect(api.updateDog).toHaveBeenCalledExactlyOnceWith("dog-1", { breed: "Golden Retriever" }),
    );
    expect(await screen.findByRole("radio", { name: "Grande" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Raza")).toHaveValue("Golden Retriever");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("discards a suggestion without updating the dog", async () => {
    const user = await openPhotos();
    await user.upload(screen.getByLabelText("Fotos de referencia (3)"), photos());
    await user.click(screen.getByRole("button", { name: "Guardar fotos" }));
    await user.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(api.updateDog).not.toHaveBeenCalled();
  });

  it.each(["429", "empty"])("silently ignores a %s suggestion", async (result) => {
    if (result === "429") {
      api.suggestDogTraits.mockRejectedValue(new ApiError("Too many requests", 429));
    } else {
      api.suggestDogTraits.mockResolvedValue({ breed: null, size: null });
    }
    const user = await openPhotos();
    await user.upload(screen.getByLabelText("Fotos de referencia (3)"), photos());
    await user.click(screen.getByRole("button", { name: "Guardar fotos" }));
    await waitFor(() => expect(api.suggestDogTraits).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("Listo, ya reconocemos a Luna");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows enrollment errors without requesting a suggestion", async () => {
    api.enrollPhotos.mockRejectedValue(new Error("Unreadable image"));
    const user = await openPhotos();
    await user.upload(screen.getByLabelText("Fotos de referencia (3)"), photos());
    await user.click(screen.getByRole("button", { name: "Guardar fotos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos guardar las fotos.");
    expect(api.suggestDogTraits).not.toHaveBeenCalled();
  });
});
