// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Issue #23 item 4: data-protection notice and consent checkbox at sign up.
// Ley 1581 de 2012 requires informed consent before collecting personal data
// (addresses, allergies, contacts). The SignupScreen must show a notice and
// a checkbox; sign up is blocked until the user checks it.

const mockSignUp = vi.fn();

vi.mock("../../apps/web/src/lib/supabase.js", () => ({
  supabase: {
    auth: {
      signUp: mockSignUp,
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
}));

async function importScreens() {
  return import("../../apps/web/src/auth/AuthScreens.js");
}

describe("Data-protection consent at sign up (Issue #23, Ley 1581)", () => {
  beforeEach(() => {
    mockSignUp.mockReset();
  });

  it("renders a data-protection consent checkbox with the correct label", async () => {
    const { SignupScreen } = await importScreens();
    render(<SignupScreen />);

    // The checkbox must be findable by its label text (getByLabelText pattern
    // from AGENTS.md). The label must mention data protection / personal data.
    const checkbox = screen.getByLabelText(/data protection|personal data|tratamiento de datos/i);
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it("blocks sign up when the consent checkbox is not checked", async () => {
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
    // Do NOT check the consent checkbox
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    // Supabase must NOT have been called — the form blocks locally
    expect(mockSignUp).not.toHaveBeenCalled();
    // An error/validation message about consent must be visible
    expect(await screen.findByText(/consent|data protection|tratamiento/i)).toBeInTheDocument();
  });

  it("allows sign up when the consent checkbox IS checked", async () => {
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
    // Check the consent checkbox
    await user.click(screen.getByLabelText(/data protection|personal data|tratamiento de datos/i));
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({ email: "walker@example.com" }),
      );
    });
  });
});
