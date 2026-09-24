// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// FR-01/02/03: signup (walker/owner role), login, password reset.
// Supabase is mocked at the module level — this suite tests CanTrack's own
// screens/validation/routing, not Supabase's client behavior. Space Bunny
// wires the real client through apps/web/src/lib/supabase.ts (the module
// path this mock targets); see AGENTS.md.

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockResetPasswordForEmail = vi.fn();

vi.mock("../../apps/web/src/lib/supabase.js", () => ({
  supabase: {
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      resetPasswordForEmail: mockResetPasswordForEmail,
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
  });

  it("signs up as a walker with the role field submitted", async () => {
    const { SignupScreen } = await importScreens();
    mockSignUp.mockResolvedValueOnce({
      data: { user: { id: "user-1", email: "walker@example.com" } },
      error: null,
    });

    const user = userEvent.setup();
    render(<SignupScreen />);

    await user.type(screen.getByLabelText(/email/i), "walker@example.com");
    await user.type(screen.getByLabelText(/password/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/walker/i));
    await user.click(screen.getByRole("button", { name: /sign up/i }));

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

    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/password/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/owner/i));
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
  });

  it("shows a validation error and never calls Supabase for an empty email", async () => {
    const { SignupScreen } = await importScreens();
    const user = userEvent.setup();
    render(<SignupScreen />);

    await user.type(screen.getByLabelText(/password/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/walker/i));
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText(/email/i)).toBeInTheDocument();
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

    await user.type(screen.getByLabelText(/email/i), "dup@example.com");
    await user.type(screen.getByLabelText(/password/i), "correct horse battery staple");
    await user.click(screen.getByLabelText(/walker/i));
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText(/already registered/i)).toBeInTheDocument();
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

    await user.type(screen.getByLabelText(/email/i), "walker@example.com");
    await user.type(screen.getByLabelText(/password/i), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: /log in/i }));

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

    await user.type(screen.getByLabelText(/email/i), "walker@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrong password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/invalid login credentials/i)).toBeInTheDocument();
  });

  it("requests a password reset email", async () => {
    const { ResetPasswordScreen } = await importScreens();
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });

    const user = userEvent.setup();
    render(<ResetPasswordScreen />);

    await user.type(screen.getByLabelText(/email/i), "walker@example.com");
    await user.click(screen.getByRole("button", { name: /reset/i }));

    await waitFor(() =>
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        "walker@example.com",
        expect.anything(),
      ),
    );
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });

  it("shows a validation error and never calls Supabase for an empty reset email", async () => {
    const { ResetPasswordScreen } = await importScreens();
    const user = userEvent.setup();
    render(<ResetPasswordScreen />);

    await user.click(screen.getByRole("button", { name: /reset/i }));

    expect(await screen.findByText(/email/i)).toBeInTheDocument();
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });
});
