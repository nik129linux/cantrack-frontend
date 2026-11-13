// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Perfil (owner), on liquid glass: the hero (name, badges, stats, dogs) and
// the collapsible sections — Tus datos, Recogida y acceso, Emergencias,
// Pagos, Avisos, Paseadores favoritos and Privacidad y cuenta (consent,
// password, sign-out, export, two-step deletion).

const mockProfile = vi.fn();
const mockSave = vi.fn();
const mockFavorite = vi.fn();
const mockAvatar = vi.fn();
const mockConsent = vi.fn();
const mockDelete = vi.fn();
const mockExport = vi.fn();
const mockChangePassword = vi.fn();
const mockSetSession = vi.fn();

vi.mock("../../apps/web/src/lib/supabase.js", () => ({ supabase: { auth: { setSession: mockSetSession } } }));
vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchOwnerProfile: mockProfile,
  saveOwnerProfile: mockSave,
  setFavoriteWalker: mockFavorite,
  uploadOwnerAvatar: mockAvatar,
  recordOwnerConsent: mockConsent,
  deleteOwnerAccount: mockDelete,
  deleteWalkerAccount: vi.fn(),
  downloadExport: mockExport,
  changePassword: mockChangePassword,
}));
vi.mock("../../apps/web/src/map/PickupMap.js", () => ({
  PickupMap: () => <div data-testid="map" />,
}));

function profile(over: Record<string, unknown> = {}) {
  return {
    ownerId: "owner-1",
    email: "camila@gmail.com",
    emailVerified: true,
    memberSince: "2026-10-01T00:00:00+00:00",
    displayName: "Camila",
    phone: null,
    avatarUrl: null,
    home: null,
    pickupNotes: null,
    handoff: null,
    emergency: null,
    vet: null,
    paymentMethod: null,
    notifications: { walkStarted: true, report: true, walkDone: true, offers: false },
    consent: { version: "2026-10", at: "2026-10-25T15:00:00+00:00" },
    stats: { dogs: 2, walksDone: 7 },
    dogs: [
      { id: "dog-1", name: "Luna", breed: null },
      { id: "dog-2", name: "Toby", breed: "Beagle" },
    ],
    walkers: [{ walkerId: "w-1", name: "María", walks: 3, favorite: false }],
    ...over,
  };
}

async function renderScreen(onGo = vi.fn()) {
  const { OwnerProfileScreen } = await import("../../apps/web/src/owner/OwnerProfileScreen.js");
  const onSignOut = vi.fn();
  const user = userEvent.setup();
  render(<OwnerProfileScreen userId="owner-1" onSignOut={onSignOut} onGo={onGo} />);
  await screen.findByRole("region", { name: "Tu perfil" });
  return { user, onSignOut, onGo };
}

function form(name: string) {
  return within(screen.getByRole("form", { name }));
}

describe("Owner Perfil", () => {
  beforeEach(() => {
    cleanup();
    for (const mock of [mockProfile, mockSave, mockFavorite, mockAvatar, mockConsent, mockDelete, mockExport, mockChangePassword, mockSetSession]) {
      mock.mockReset();
    }
    mockProfile.mockResolvedValue(profile());
  });

  it("shows the hero: name, badges, stats, dogs and the consent line", async () => {
    await renderScreen();

    expect(screen.getByRole("heading", { name: "Camila", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Correo verificado")).toBeInTheDocument();
    expect(screen.getByText("Sin teléfono")).toBeInTheDocument();
    const stats = screen.getByText("Paseos hechos").closest("div")!;
    expect(within(stats).getByText("7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Luna/ })).toBeInTheDocument();
    expect(screen.getByText("Aceptaste la política de datos (2026-10) el 25 oct 2026")).toBeInTheDocument();
  });

  it("goes to Mis perros from the hero", async () => {
    const { user, onGo } = await renderScreen();
    await user.click(screen.getByRole("button", { name: "Ver mis perros" }));
    expect(onGo).toHaveBeenCalledWith("dogs");
  });

  it("survives an answer without the newer sections", async () => {
    mockProfile.mockResolvedValue({
      ownerId: "owner-1", email: "camila@gmail.com", displayName: "Camila", phone: null,
      avatarUrl: null, home: null, consent: null, stats: { dogs: 0, walksDone: 0 },
    });
    await renderScreen();

    expect(screen.getByRole("button", { name: "Agrega tu primer perro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acepto el tratamiento de datos" })).toBeInTheDocument();
  });

  it("asks a brand-new owner to complete the profile", async () => {
    mockProfile.mockResolvedValue(profile({ displayName: null, consent: null }));
    await renderScreen();

    expect(screen.getByText("Completa tu perfil: dinos cómo te llamas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acepto el tratamiento de datos" })).toBeInTheDocument();
  });

  it("validates name and phone before calling the API", async () => {
    const { user } = await renderScreen();
    const data = form("Tus datos");
    await user.clear(data.getByLabelText("Nombre"));
    await user.type(data.getByLabelText("Teléfono"), "abc");
    await user.click(data.getByRole("button", { name: "Guardar" }));

    expect(await data.findByText("Escribe tu nombre (máx. 80) · Teléfono no válido")).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("saves only the data section", async () => {
    mockSave.mockResolvedValue(profile({ displayName: "Camila R", phone: "+57 300 123 4567" }));
    const { user } = await renderScreen();
    const data = form("Tus datos");
    await user.clear(data.getByLabelText("Nombre"));
    await user.type(data.getByLabelText("Nombre"), "Camila R");
    await user.type(data.getByLabelText("Teléfono"), "+57 300 123 4567");
    await user.click(data.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith("owner-1", { displayName: "Camila R", phone: "+57 300 123 4567" }),
    );
    expect(await screen.findByText("Guardamos tus datos.")).toBeInTheDocument();
  });

  it("saves the emergency contact and the vet", async () => {
    mockSave.mockResolvedValue(profile({ emergency: { name: "Ana", relation: "Hermana", phone: "+57 301 000 0000" } }));
    const { user } = await renderScreen();
    const em = form("Emergencias");
    await user.type(em.getByLabelText("Nombre del contacto"), "Ana");
    await user.type(em.getByLabelText("Parentesco"), "Hermana");
    await user.type(em.getAllByLabelText("Teléfono")[0]!, "+57 301 000 0000");
    await user.type(em.getByLabelText("Clínica o veterinario"), "Vet Pasto");
    await user.click(em.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith("owner-1", {
        emergency: { name: "Ana", relation: "Hermana", phone: "+57 301 000 0000" },
        vet: { name: "Vet Pasto", phone: null },
      }),
    );
  });

  it("turns a notice off right away and quietly", async () => {
    mockSave.mockResolvedValue(profile({ notifications: { walkStarted: false, report: true, walkDone: true, offers: false } }));
    const { user } = await renderScreen();
    await user.click(screen.getByRole("switch", { name: /Paseo iniciado/ }));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        "owner-1",
        { notifications: { walkStarted: false, report: true, walkDone: true, offers: false } },
        true,
      ),
    );
    expect(screen.getByRole("switch", { name: /Paseo iniciado/ })).not.toBeChecked();
  });

  it("marks a walker as favorite", async () => {
    mockFavorite.mockResolvedValue(profile({ walkers: [{ walkerId: "w-1", name: "María", walks: 3, favorite: true }] }));
    const { user } = await renderScreen();
    await user.click(screen.getByRole("button", { name: "☆ Marcar favorito" }));

    await waitFor(() => expect(mockFavorite).toHaveBeenCalledWith("owner-1", "w-1", true));
    expect(await screen.findByRole("button", { name: "★ Favorito" })).toHaveAttribute("aria-pressed", "true");
  });

  it("explains the avatar upload errors", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockAvatar.mockRejectedValueOnce(new ApiError("The avatar must be 2 MB or less.", 413));
    const { user } = await renderScreen();

    await user.upload(screen.getByLabelText("Cambiar foto"), new File(["x"], "perro.png", { type: "image/png" }));
    expect(await screen.findByText("La foto pesa más de 2 MB")).toBeInTheDocument();

    mockAvatar.mockRejectedValueOnce(new ApiError("Unreadable image.", 400));
    await user.upload(screen.getByLabelText("Cambiar foto"), new File(["x"], "roto.png", { type: "image/png" }));
    expect(await screen.findByText("No pudimos leer esa imagen")).toBeInTheDocument();
  });

  it("shows a retry when the profile does not load", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockProfile.mockRejectedValueOnce(new ApiError("boom", 500)).mockResolvedValue(profile());
    const { OwnerProfileScreen } = await import("../../apps/web/src/owner/OwnerProfileScreen.js");
    const user = userEvent.setup();
    render(<OwnerProfileScreen userId="owner-1" onSignOut={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Camila", level: 1 })).toBeInTheDocument();
  });

  it("changes the password and keeps this device signed in with the returned tokens", async () => {
    mockChangePassword.mockResolvedValue({ message: "ok", session: { access_token: "a2", refresh_token: "r2", expires_in: 3600, user: {} } });
    const { user } = await renderScreen();
    await user.type(screen.getByLabelText("Contraseña actual"), "vieja contraseña larga");
    await user.type(screen.getByLabelText("Contraseña nueva"), "mi perro se llama luna");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    await waitFor(() => expect(mockChangePassword).toHaveBeenCalledWith("vieja contraseña larga", "mi perro se llama luna"));
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: "a2", refresh_token: "r2" });
    expect(await screen.findByText("Contraseña cambiada. Cerramos tu sesión en los otros dispositivos.")).toBeInTheDocument();
  });

  it("says the current password is wrong on a 401", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockChangePassword.mockRejectedValue(new ApiError("Invalid", 401));
    const { user } = await renderScreen();
    await user.type(screen.getByLabelText("Contraseña actual"), "mala");
    await user.type(screen.getByLabelText("Contraseña nueva"), "mi perro se llama luna");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    expect(await screen.findByText("La contraseña actual no es correcta.")).toBeInTheDocument();
  });

  it("signs out of this device or of every device", async () => {
    const { user, onSignOut } = await renderScreen();
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(onSignOut).toHaveBeenLastCalledWith();

    await user.click(screen.getByRole("button", { name: "Cerrar sesión en todos los dispositivos" }));
    expect(onSignOut).toHaveBeenLastCalledWith("global");
  });

  it("downloads the export with the name the server chose", async () => {
    mockExport.mockResolvedValue({ blob: new Blob(["{}"]), filename: "cantrack-export.json" });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { user } = await renderScreen();

    await user.click(screen.getByRole("button", { name: "Descargar mis datos" }));
    await waitFor(() => expect(mockExport).toHaveBeenCalledWith("owner", "owner-1"));
    expect(click).toHaveBeenCalled();
  });

  it("deletes the account only after typing ELIMINAR, then signs out", async () => {
    mockDelete.mockResolvedValue(undefined);
    const { user, onSignOut } = await renderScreen();
    await user.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));

    const confirm = screen.getByRole("button", { name: "Eliminar para siempre" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("Escribe ELIMINAR para confirmar"), "ELIMINAR");
    await user.click(confirm);

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("owner-1"));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("explains that a walk in progress blocks the deletion", async () => {
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockDelete.mockRejectedValue(new ApiError("Finish your walk in progress before deleting the account.", 409));
    const { user, onSignOut } = await renderScreen();
    await user.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
    await user.type(screen.getByLabelText("Escribe ELIMINAR para confirmar"), "ELIMINAR");
    await user.click(screen.getByRole("button", { name: "Eliminar para siempre" }));

    expect(await screen.findByText("Tienes un paseo en curso. Podrás eliminar la cuenta cuando termine.")).toBeInTheDocument();
    expect(onSignOut).not.toHaveBeenCalled();
  });
});
