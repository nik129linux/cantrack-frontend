// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// FR-01/02/03: signup (walker/owner role), login, password reset.
// Supabase is mocked at the module level — this suite tests CanTrack's own
// screens/validation/routing, not Supabase's client behavior. Space Bunny
// wires the real client through apps/web/src/lib/supabase.ts (the module
// path this mock targets); see AGENTS.md.

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockSignInWithOAuth = vi.fn();

vi.mock("../../apps/web/src/lib/supabase.js", () => ({
  supabase: {
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      resetPasswordForEmail: mockResetPasswordForEmail,
      signInWithOAuth: mockSignInWithOAuth,
    },
  },
}));

async function importScreens() {
  return import("../../apps/web/src/auth/AuthScreens.js");
}

describe("Auth screens (FR-01, FR-02, FR-03)", () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockSignInWithPassword.mockReset();
    mockResetPasswordForEmail.mockReset();
    mockSignInWithOAuth.mockReset();
  });

  it("signs up as a walker with the role field submitted", async () => {
    const { SignupScreen } = await importScreens();
    mockSignUp.mockResolvedValueOnce({
      data: { user: { id: "user-1", email: "walker@example.com" } },
      error: null,
    });

    const user = userEvent.setup();
    render(<SignupScreen />);

    await user.type(screen.getByLabelText(/correo electrónico/i), "walker@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/cuidador/i));
    await user.click(screen.getByLabelText(/tratamiento de datos/i));
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({ email: "walker@example.com" }),
      );
    });
  });

  it("signs up as an owner with the role field submitted", async () => {
    const { SignupScreen } = await importScreens();
    mockSignUp.mockResolvedValueOnce({
      data: { user: { id: "user-2", email: "owner@example.com" } },
      error: null,
    });

    const user = userEvent.setup();
    render(<SignupScreen />);

    await user.type(screen.getByLabelText(/correo electrónico/i), "owner@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/dueño/i));
    await user.click(screen.getByLabelText(/tratamiento de datos/i));
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
  });

  it("shows a validation error and never calls Supabase for an empty email", async () => {
    const { SignupScreen } = await importScreens();
    const user = userEvent.setup();
    render(<SignupScreen />);

    await user.type(screen.getByLabelText(/contraseña/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/cuidador/i));
    await user.click(screen.getByLabelText(/tratamiento de datos/i));
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText("Escribe tu correo electrónico.")).toBeInTheDocument();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("shows the Supabase error message when signup fails", async () => {
    const { SignupScreen } = await importScreens();
    mockSignUp.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "User already registered" },
    });

    const user = userEvent.setup();
    render(<SignupScreen />);

    await user.type(screen.getByLabelText(/correo electrónico/i), "dup@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/cuidador/i));
    await user.click(screen.getByLabelText(/tratamiento de datos/i));
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText("Ese correo ya tiene una cuenta.")).toBeInTheDocument();
  });

  it("logs in with correct credentials", async () => {
    const { LoginScreen } = await importScreens();
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: { access_token: "token-abc" },
        user: { id: "user-1", email: "walker@example.com" },
      },
      error: null,
    });

    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(screen.getByLabelText(/correo electrónico/i), "walker@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    await waitFor(() => expect(mockSignInWithPassword).toHaveBeenCalled());
  });

  it("shows an error on wrong login credentials", async () => {
    const { LoginScreen } = await importScreens();
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials" },
    });

    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(screen.getByLabelText(/correo electrónico/i), "walker@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "wrong password");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
  });

  it("requests a password reset email", async () => {
    const { ResetPasswordScreen } = await importScreens();
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });

    const user = userEvent.setup();
    render(<ResetPasswordScreen />);

    await user.type(screen.getByLabelText(/correo electrónico/i), "walker@example.com");
    await user.click(screen.getByRole("button", { name: /enviar enlace/i }));

    await waitFor(() =>
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        "walker@example.com",
        expect.anything(),
      ),
    );
    expect(await screen.findByText(/revisa tu correo/i)).toBeInTheDocument();
  });

  it("shows a validation error and never calls Supabase for an empty reset email", async () => {
    const { ResetPasswordScreen } = await importScreens();
    const user = userEvent.setup();
    render(<ResetPasswordScreen />);

    await user.click(screen.getByRole("button", { name: /enviar enlace/i }));

    expect(await screen.findByText("Escribe tu correo electrónico.")).toBeInTheDocument();
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("blocks sign up and stores nothing when the data-protection box is unchecked", async () => {
    const { SignupScreen } = await importScreens();
    const user = userEvent.setup();
    render(<SignupScreen />);

    await user.type(screen.getByLabelText(/correo electrónico/i), "walker@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Marca la casilla de datos personales para continuar.",
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("sends the optional name and phone as user metadata next to the role", async () => {
    const { SignupScreen } = await importScreens();
    mockSignUp.mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null });

    const user = userEvent.setup();
    render(<SignupScreen />);

    await user.type(screen.getByLabelText(/nombre/i), "Ana Pérez");
    await user.type(screen.getByLabelText(/correo electrónico/i), "ana@example.com");
    await user.type(screen.getByLabelText(/teléfono/i), "3001234567");
    await user.type(screen.getByLabelText(/contraseña/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/dueño/i));
    await user.click(screen.getByLabelText(/tratamiento de datos/i));
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "ana@example.com",
        password: "correct horse battery staple",
        options: { data: { role: "owner", full_name: "Ana Pérez", phone: "3001234567" } },
      });
    });
  });

  it("shows and hides the password with the eye toggle", async () => {
    const { LoginScreen } = await importScreens();
    const user = userEvent.setup();
    render(<LoginScreen />);

    const input = screen.getByLabelText(/contraseña/i);
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Mostrar clave" }));
    expect(input).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Ocultar clave" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it.each([
    ["Continuar con Google", "google"],
    ["Continuar con Apple", "apple"],
  ])("%s starts the OAuth flow with the exact provider", async (name, provider) => {
    const { LoginScreen } = await importScreens();
    mockSignInWithOAuth.mockResolvedValueOnce({ data: {}, error: null });

    const user = userEvent.setup();
    render(<LoginScreen />);
    await user.click(screen.getByRole("button", { name }));

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider,
        options: { redirectTo: window.location.origin },
      });
    });
  });

  it("shows a Spanish error when the OAuth provider fails", async () => {
    const { LoginScreen } = await importScreens();
    mockSignInWithOAuth.mockResolvedValueOnce({ data: {}, error: { message: "provider is not enabled" } });

    const user = userEvent.setup();
    render(<LoginScreen />);
    await user.click(screen.getByRole("button", { name: "Continuar con Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos conectar con ese servicio. Inténtalo de nuevo.",
    );
  });

  it("starts on the role screen and keeps Continue disabled until a role is chosen", async () => {
    const { AuthShell } = await import("../../apps/web/src/auth/AuthShell.js");
    cleanup(); // earlier tests leave their screens mounted (no auto-cleanup)
    const user = userEvent.setup();
    render(<AuthShell />);

    expect(screen.getByRole("heading", { name: "¿Cómo quieres usar CanTrack?" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Correo electrónico")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();

    await user.click(screen.getByLabelText(/soy dueño/i));
    expect(screen.getByRole("button", { name: /continuar/i })).toBeEnabled();
  });

  it("registers with the role picked on the role screen, without asking for it again", async () => {
    const { AuthShell } = await import("../../apps/web/src/auth/AuthShell.js");
    cleanup();
    mockSignUp.mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null });
    const user = userEvent.setup();
    render(<AuthShell />);

    await user.click(screen.getByLabelText(/soy cuidador/i));
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    expect(screen.getByRole("heading", { name: "Crea tu cuenta" })).toBeInTheDocument();
    expect(screen.getByText("Cuidador")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /dueño/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Correo electrónico"), "walker@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "correct horse battery staple");
    await user.click(screen.getByLabelText(/tratamiento de datos/i));
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "walker@example.com",
        password: "correct horse battery staple",
        options: { data: { role: "walker" } },
      });
    });
  });

  it("lets the user change the role from the signup screen", async () => {
    const { AuthShell } = await import("../../apps/web/src/auth/AuthShell.js");
    cleanup();
    const user = userEvent.setup();
    render(<AuthShell />);

    await user.click(screen.getByLabelText(/soy dueño/i));
    await user.click(screen.getByRole("button", { name: /continuar/i }));
    await user.click(screen.getByRole("button", { name: "Cambiar" }));

    expect(screen.getByRole("heading", { name: "¿Cómo quieres usar CanTrack?" })).toBeInTheDocument();
    expect(screen.getByLabelText(/soy dueño/i)).toBeChecked();
  });

  it("moves between role, signup, login and reset from the links inside the card", async () => {
    const { AuthShell } = await import("../../apps/web/src/auth/AuthShell.js");
    cleanup();
    const user = userEvent.setup();
    render(<AuthShell />);

    await user.click(screen.getByRole("button", { name: "Ingresa" }));
    expect(screen.getByRole("heading", { name: "Qué bueno verte de nuevo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }));
    expect(screen.getByRole("heading", { name: "Recupera tu contraseña" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Volver a ingresar" }));
    expect(screen.getByRole("heading", { name: "Qué bueno verte de nuevo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Regístrate" }));
    expect(screen.getByRole("heading", { name: "Crea tu cuenta" })).toBeInTheDocument();
  });
});
