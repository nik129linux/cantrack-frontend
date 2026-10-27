// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Perfil (owner), docs/frontend/perfil.md + auth-role.md: profile form with the
// brief's limits, avatar errors, consent line, change password, sign-out scopes,
// export and the two-step account deletion.

const mockProfile = vi.fn();
const mockSave = vi.fn();
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
    displayName: "Camila",
    phone: null,
    avatarUrl: null,
    home: null,
    consent: { version: "2026-10", at: "2026-10-25T15:00:00+00:00" },
    stats: { dogs: 2, walksDone: 7 },
    ...over,
  };
}

async function renderScreen() {
  const { OwnerProfileScreen } = await import("../../apps/web/src/owner/OwnerProfileScreen.js");
  const onSignOut = vi.fn();
  const user = userEvent.setup();
  render(<OwnerProfileScreen userId="owner-1" onSignOut={onSignOut} />);
  await screen.findByRole("heading", { name: "Perfil" });
  return { user, onSignOut };
}

describe("Owner Perfil", () => {
  beforeEach(() => {
    cleanup();
    for (const mock of [mockProfile, mockSave, mockAvatar, mockConsent, mockDelete, mockExport, mockChangePassword, mockSetSession]) {
      mock.mockReset();
    }
    mockProfile.mockResolvedValue(profile());
  });

  it("shows the profile, the stats and the consent line", async () => {
    await renderScreen();

    expect(screen.getByText("camila@gmail.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Camila");
    expect(screen.getByText("2 perros · 7 paseos hechos")).toBeInTheDocument();
    expect(screen.getByText("Aceptaste la política de datos (2026-10) el 25 oct 2026")).toBeInTheDocument();
  });

  it("asks a brand-new owner to complete the profile", async () => {
    mockProfile.mockResolvedValue(profile({ displayName: null, consent: null }));
    await renderScreen();

    expect(screen.getByText("Completa tu perfil: dinos cómo te llamas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acepto el tratamiento de datos" })).toBeInTheDocument();
  });

  it("validates name and phone with the brief's copy before calling the API", async () => {
    const { user } = await renderScreen();
    await user.clear(screen.getByLabelText("Nombre"));
    await user.type(screen.getByLabelText("Teléfono"), "abc");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Escribe tu nombre (máx. 80)")).toBeInTheDocument();
    expect(screen.getByText("Teléfono no válido")).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("saves the profile", async () => {
    mockSave.mockResolvedValue(profile({ displayName: "Camila R", phone: "+57 300 123 4567" }));
    const { user } = await renderScreen();
    await user.clear(screen.getByLabelText("Nombre"));
    await user.type(screen.getByLabelText("Nombre"), "Camila R");
    await user.type(screen.getByLabelText("Teléfono"), "+57 300 123 4567");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith("owner-1", { displayName: "Camila R", phone: "+57 300 123 4567", home: null }),
    );
    expect(await screen.findByText("Guardamos tu perfil.")).toBeInTheDocument();
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
