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
const mockLogin = vi.fn();
const mockResetPassword = vi.fn();
const mockResend = vi.fn();
const mockSetSession = vi.fn();
const mockSignInWithOAuth = vi.fn();

// Signup, login and reset go through the API; supabase-js only keeps the session.
vi.mock("../../apps/web/src/lib/supabase.js", () => ({
  supabase: {
    auth: {
      setSession: mockSetSession,
      signInWithOAuth: mockSignInWithOAuth,
    },
  },
}));

vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  signupAccount: mockSignUp,
  loginAccount: mockLogin,
  requestPasswordReset: mockResetPassword,
  resendVerification: mockResend,
}));

async function importScreens() {
  return import("../../apps/web/src/auth/AuthScreens.js");
}

describe("Auth screens (FR-01, FR-02, FR-03)", () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockLogin.mockReset();
    mockResetPassword.mockReset();
    mockResend.mockReset();
    mockSetSession.mockReset();
    mockSignInWithOAuth.mockReset();
  });

  it("signs up as a walker with the role field submitted", async () => {
    const { SignupScreen } = await importScreens();
    mockSignUp.mockResolvedValueOnce({ user: { id: "user-1" }, session: null });

    const user = userEvent.setup();
    render(<SignupScreen />);

    await user.type(screen.getByLabelText(/correo electrónico/i), "walker@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/paseador/i));
    await user.click(screen.getByLabelText(/tratamiento de datos/i));
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "walker@example.com",
        password: "correct horse battery staple",
        role: "walker",
      });
    });
    expect(await screen.findByText(/revisa tu correo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reenviar link/i })).toBeInTheDocument();
  });

  it("signs up as an owner with the role field submitted", async () => {
    const { SignupScreen } = await importScreens();
    mockSignUp.mockResolvedValueOnce({ user: { id: "user-2" }, session: null });

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
    await user.click(screen.getByLabelText(/paseador/i));
    await user.click(screen.getByLabelText(/tratamiento de datos/i));
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText("Escribe tu correo electrónico.")).toBeInTheDocument();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("shows the Supabase error message when signup fails", async () => {
    const { SignupScreen } = await importScreens();
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockSignUp.mockRejectedValueOnce(new ApiError("User already registered", 400));

    const user = userEvent.setup();
    render(<SignupScreen />);

    await user.type(screen.getByLabelText(/correo electrónico/i), "dup@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/paseador/i));
    await user.click(screen.getByLabelText(/tratamiento de datos/i));
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText("Ese correo ya tiene una cuenta.")).toBeInTheDocument();
  });

  it("logs in with correct credentials", async () => {
    const { LoginScreen } = await importScreens();
    mockLogin.mockResolvedValueOnce({
      access_token: "token-abc",
      refresh_token: "refresh-abc",
      expires_in: 3600,
      user: { id: "user-1" },
    });

    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(screen.getByLabelText(/correo electrónico/i), "walker@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith("walker@example.com", "correct horse battery staple"),
    );
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "token-abc",
      refresh_token: "refresh-abc",
    });
  });

  it("shows an error on wrong login credentials", async () => {
    const { LoginScreen } = await importScreens();
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockLogin.mockRejectedValueOnce(new ApiError("Invalid credentials", 401));

    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(screen.getByLabelText(/correo electrónico/i), "walker@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "wrong password");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
  });

  it("requests a password reset email", async () => {
    const { ResetPasswordScreen } = await importScreens();
    mockResetPassword.mockResolvedValueOnce({ message: "ok" });

    const user = userEvent.setup();
    render(<ResetPasswordScreen />);

    await user.type(screen.getByLabelText(/correo electrónico/i), "walker@example.com");
    await user.click(screen.getByRole("button", { name: /enviar enlace/i }));

    await waitFor(() => expect(mockResetPassword).toHaveBeenCalledWith("walker@example.com"));
    expect(await screen.findByText(/revisa tu correo/i)).toBeInTheDocument();
  });

  it("shows a validation error and never calls Supabase for an empty reset email", async () => {
    const { ResetPasswordScreen } = await importScreens();
    const user = userEvent.setup();
    render(<ResetPasswordScreen />);

    await user.click(screen.getByRole("button", { name: /enviar enlace/i }));

    expect(await screen.findByText("Escribe tu correo electrónico.")).toBeInTheDocument();
    expect(mockResetPassword).not.toHaveBeenCalled();
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

  it("shows the password tip and sends only email, password and role to the API", async () => {
    const { SignupScreen } = await importScreens();
    mockSignUp.mockResolvedValueOnce({ user: { id: "user-1" }, session: null });

    const user = userEvent.setup();
    render(<SignupScreen />);

    expect(screen.getByText(/una frase larga es más segura/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/correo electrónico/i), "ana@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/dueño/i));
    await user.click(screen.getByLabelText(/tratamiento de datos/i));
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "ana@example.com",
        password: "correct horse battery staple",
        role: "owner",
      });
    });
  });

  it("explains an unverified email on login and offers to resend the link", async () => {
    const { LoginScreen } = await importScreens();
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    mockLogin.mockRejectedValueOnce(new ApiError("Email not verified", 403));
    mockResend.mockResolvedValueOnce({ message: "ok" });

    const user = userEvent.setup();
    render(<LoginScreen />);
    await user.type(screen.getByLabelText(/correo electrónico/i), "walker@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(await screen.findByText("Primero confirma tu correo.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /reenviar link/i }));
    await waitFor(() => expect(mockResend).toHaveBeenCalledWith("walker@example.com"));
  });

  it("locks the form after too many failed logins", async () => {
    const { LoginScreen } = await importScreens();
    const { ApiError } = await import("../../apps/web/src/lib/apiError.js");
    const tooMany = new ApiError("Too many attempts", 429);
    tooMany.retryAfter = 900;
    mockLogin.mockRejectedValueOnce(tooMany);

    const user = userEvent.setup();
    render(<LoginScreen />);
    await user.type(screen.getByLabelText(/correo electrónico/i), "walker@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "wrong password");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(
      await screen.findByText("Demasiados intentos. Intenta de nuevo en 15 minutos."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ingresar/i })).toBeDisabled();
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
    mockSignUp.mockResolvedValueOnce({ user: { id: "user-1" }, session: null });
    const user = userEvent.setup();
    render(<AuthShell />);

    await user.click(screen.getByLabelText(/soy paseador/i));
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    expect(screen.getByRole("heading", { name: "Crea tu cuenta" })).toBeInTheDocument();
    expect(screen.getByText("Paseador")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /dueño/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Correo electrónico"), "walker@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "correct horse battery staple");
    await user.click(screen.getByLabelText(/tratamiento de datos/i));
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "walker@example.com",
        password: "correct horse battery staple",
        role: "walker",
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
