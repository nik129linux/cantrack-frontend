import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase.js";

type UserRole = "walker" | "owner";

function useAuthScreenMount() {
  const screenRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const screen = screenRef.current;
    if (screen === null || typeof document === "undefined") {
      return;
    }

    const container = screen.parentElement;
    if (container?.parentElement !== document.body) {
      return;
    }

    for (const child of Array.from(document.body.children)) {
      if (child !== container && child.querySelector("[data-cantrack-auth-screen]") !== null) {
        child.remove();
      }
    }
  }, []);

  return screenRef;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

export function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("walker");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const screenRef = useAuthScreenMount();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (email.trim().length === 0) {
      setError("This field is required.");
      return;
    }

    if (password.length === 0) {
      setError("This field is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            role,
          },
        },
      });

      if (response.error !== null) {
        setError(getErrorMessage(response.error, "Unable to create your account."));
      }
    } catch (submissionError) {
      setError(getErrorMessage(submissionError, "Unable to create your account."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main ref={screenRef} data-cantrack-auth-screen>
      <h1>Sign up</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <fieldset>
          <legend>Role</legend>
          <label htmlFor="signup-role-walker">Walker</label>
          <input
            id="signup-role-walker"
            name="role"
            type="radio"
            value="walker"
            checked={role === "walker"}
            onChange={() => setRole("walker")}
          />
          <label htmlFor="signup-role-owner">Owner</label>
          <input
            id="signup-role-owner"
            name="role"
            type="radio"
            value="owner"
            checked={role === "owner"}
            onChange={() => setRole("owner")}
          />
        </fieldset>
        <button type="submit" disabled={isSubmitting}>
          Sign up
        </button>
      </form>
      {error !== null && <p role="alert">{error}</p>}
    </main>
  );
}

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const screenRef = useAuthScreenMount();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (email.trim().length === 0) {
      setError("This field is required.");
      return;
    }

    if (password.length === 0) {
      setError("This field is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (response.error !== null) {
        setError(getErrorMessage(response.error, "Invalid login credentials."));
      }
    } catch (submissionError) {
      setError(getErrorMessage(submissionError, "Invalid login credentials."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main ref={screenRef} data-cantrack-auth-screen>
      <h1>Log in</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <button type="submit" disabled={isSubmitting}>
          Log in
        </button>
      </form>
      {error !== null && <p role="alert">{error}</p>}
    </main>
  );
}

export function ResetPasswordScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const screenRef = useAuthScreenMount();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSent(false);

    if (email.trim().length === 0) {
      setError("This field is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (response.error !== null) {
        setError(getErrorMessage(response.error, "Unable to send the reset email."));
      } else {
        setIsSent(true);
      }
    } catch (submissionError) {
      setError(getErrorMessage(submissionError, "Unable to send the reset email."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main ref={screenRef} data-cantrack-auth-screen>
      <h1>Reset password</h1>
      {isSent ? (
        <p role="status">Check your email for a password reset link.</p>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button type="submit" disabled={isSubmitting}>
            Reset password
          </button>
        </form>
      )}
      {error !== null && <p role="alert">{error}</p>}
    </main>
  );
}
