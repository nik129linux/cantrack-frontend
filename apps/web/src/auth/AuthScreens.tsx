import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase.js";
import { Button } from "../ui/Button.js";
import { InteractiveMascot } from "../ui/InteractiveMascot.js";
import { PeekingDog } from "../ui/PeekingDog.js";
import { playTap, playSuccess } from "../lib/sound.js";

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

export function SignupScreen({ onSwitchToLogin }: { onSwitchToLogin?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("walker");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | "other" | null>(null);
  const screenRef = useAuthScreenMount();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    playTap(520);
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
      } else {
        playSuccess();
      }
    } catch (submissionError) {
      setError(getErrorMessage(submissionError, "Unable to create your account."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main ref={screenRef} data-cantrack-auth-screen className="auth-screen-air">
      <div className="auth-screen__header">
        <h1 className="auth-screen__title">Sign up</h1>
        <p className="auth-screen__subtitle">Únete a la red inteligente de paseadores y dueños</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="auth-form-air">
        <div className="form-field">
          <label className="form-label" htmlFor="signup-email">
            Email
          </label>
          <div className="form-input-wrapper">
            <span className="form-input-icon" aria-hidden="true">✉</span>
            <input
              id="signup-email"
              className="form-input form-input--pill"
              name="email"
              type="email"
              placeholder="tu@correo.com"
              value={email}
              onFocus={() => {
                setFocusedField("email");
                playTap(440);
              }}
              onBlur={() => setFocusedField(null)}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="signup-password">
            Password
          </label>
          <div className="form-input-wrapper">
            <span className="form-input-icon" aria-hidden="true">🔒</span>
            <input
              id="signup-password"
              className="form-input form-input--pill"
              name="password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onFocus={() => {
                setFocusedField("password");
                playTap(440);
              }}
              onBlur={() => setFocusedField(null)}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>

        <fieldset className="role-picker role-picker--air">
          <legend className="form-label">Elige tu rol en CanTrack</legend>
          <div className="role-picker__grid">
            <label
              className={`role-picker__card ${role === "walker" ? "role-picker__card--active" : ""}`}
              htmlFor="signup-role-walker"
              onClick={() => playTap(500)}
            >
              <div className="role-picker__avatar">
                <InteractiveMascot character="walker" decorative size={68} />
              </div>
              <div className="role-picker__info">
                <span className="role-picker__title">Walker</span>
                <span className="role-picker__desc">Paseador profesional</span>
              </div>
            </label>
            <input
              id="signup-role-walker"
              className="role-picker__input role-picker__input--walker sr-only"
              name="role"
              type="radio"
              value="walker"
              checked={role === "walker"}
              onChange={() => setRole("walker")}
            />

            <label
              className={`role-picker__card ${role === "owner" ? "role-picker__card--active" : ""}`}
              htmlFor="signup-role-owner"
              onClick={() => playTap(500)}
            >
              <div className="role-picker__avatar">
                <InteractiveMascot character="dog" decorative size={68} />
              </div>
              <div className="role-picker__info">
                <span className="role-picker__title">Owner</span>
                <span className="role-picker__desc">Dueño de perritos</span>
              </div>
            </label>
            <input
              id="signup-role-owner"
              className="role-picker__input role-picker__input--owner sr-only"
              name="role"
              type="radio"
              value="owner"
              checked={role === "owner"}
              onChange={() => setRole("owner")}
            />
          </div>
        </fieldset>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="btn-pill-cta"
        >
          {isSubmitting ? "Creando cuenta..." : "Sign up"}
        </Button>
      </form>

      {error !== null && (
        <p role="alert" className="auth-alert-air">
          {error}
        </p>
      )}

      {/* Interactive Peeking Dog */}
      <PeekingDog
        focusedField={focusedField}
        hasError={error !== null}
        isSubmitting={isSubmitting}
      />
    </main>
  );
}

export function LoginScreen({ onForgotPassword }: { onForgotPassword?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | "other" | null>(null);
  const screenRef = useAuthScreenMount();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    playTap(520);
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
      } else {
        playSuccess();
      }
    } catch (submissionError) {
      setError(getErrorMessage(submissionError, "Invalid login credentials."));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Quick helper to fill demo credentials
  function fillDemo(type: "walker" | "owner") {
    playTap(600);
    if (type === "walker") {
      setEmail("walker@cantrack.app");
      setPassword("demo-walker-2026");
    } else {
      setEmail("owner@cantrack.app");
      setPassword("demo-owner-2026");
    }
  }

  return (
    <main ref={screenRef} data-cantrack-auth-screen className="auth-screen-air">
      <div className="auth-screen__header">
        <h1 className="auth-screen__title">Log in</h1>
        <p className="auth-screen__subtitle">Inicia sesión en tu cuenta de CanTrack</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="auth-form-air">
        <div className="form-field">
          <label className="form-label" htmlFor="login-email">
            Email
          </label>
          <div className="form-input-wrapper">
            <span className="form-input-icon" aria-hidden="true">✉</span>
            <input
              id="login-email"
              className="form-input form-input--pill"
              name="email"
              type="email"
              placeholder="Username / Email"
              value={email}
              onFocus={() => {
                setFocusedField("email");
                playTap(440);
              }}
              onBlur={() => setFocusedField(null)}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="login-password">
            Password
          </label>
          <div className="form-input-wrapper">
            <span className="form-input-icon" aria-hidden="true">🔒</span>
            <input
              id="login-password"
              className="form-input form-input--pill"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••••••"
              value={password}
              onFocus={() => {
                setFocusedField("password");
                playTap(440);
              }}
              onBlur={() => setFocusedField(null)}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="form-password-toggle"
              aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
              onClick={() => {
                setShowPassword(!showPassword);
                playTap(400);
              }}
            >
              {showPassword ? "👁" : "👁‍🗨"}
            </button>
          </div>
        </div>

        {/* Action Button: Warm pill CTA styled like Image 1 */}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="btn-pill-cta btn-pill-cta--login"
        >
          {isSubmitting ? "Ingresando..." : "Log in"}
        </Button>

        {/* Forgot password link */}
        <div className="auth-links-row">
          <button
            type="button"
            className="auth-link-subtle"
            onClick={() => {
              playTap(380);
              onForgotPassword?.();
            }}
          >
            Forgot your password?
          </button>
        </div>

        {/* Quick Demo Fillers for testing ease */}
        <div className="demo-credentials-bar">
          <span className="demo-credentials-label">Relleno rápido demo:</span>
          <div className="demo-credentials-pills">
            <button
              type="button"
              className="demo-pill"
              onClick={() => fillDemo("walker")}
            >
              Paseador Demo
            </button>
            <button
              type="button"
              className="demo-pill"
              onClick={() => fillDemo("owner")}
            >
              Dueño Demo
            </button>
          </div>
        </div>
      </form>

      {error !== null && (
        <p role="alert" className="auth-alert-air">
          {error}
        </p>
      )}

      {/* The iconic Peeking Dog companion */}
      <PeekingDog
        focusedField={focusedField}
        hasError={error !== null}
        isSubmitting={isSubmitting}
      />
    </main>
  );
}

export function ResetPasswordScreen({ onBackToLogin }: { onBackToLogin?: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | "other" | null>(null);
  const screenRef = useAuthScreenMount();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    playTap(520);
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
        playSuccess();
      }
    } catch (submissionError) {
      setError(getErrorMessage(submissionError, "Unable to send the reset email."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main ref={screenRef} data-cantrack-auth-screen className="auth-screen-air">
      <div className="auth-screen__header">
        <h1 className="auth-screen__title">Reset password</h1>
        <p className="auth-screen__subtitle">Recupera el acceso a tu cuenta de CanTrack</p>
      </div>

      {isSent ? (
        <div className="auth-success-card">
          <span className="auth-success-icon" aria-hidden="true">✓</span>
          <p role="status" className="auth-success-message">
            Check your email for a password reset link.
          </p>
          <button
            type="button"
            className="auth-link-subtle"
            onClick={onBackToLogin}
          >
            Volver a iniciar sesión
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="auth-form-air">
          <div className="form-field">
            <label className="form-label" htmlFor="reset-email">
              Email
            </label>
            <div className="form-input-wrapper">
              <span className="form-input-icon" aria-hidden="true">✉</span>
              <input
                id="reset-email"
                className="form-input form-input--pill"
                name="email"
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onFocus={() => {
                  setFocusedField("email");
                  playTap(440);
                }}
                onBlur={() => setFocusedField(null)}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="btn-pill-cta"
          >
            {isSubmitting ? "Enviando..." : "Reset password"}
          </Button>

          {onBackToLogin && (
            <div className="auth-links-row">
              <button
                type="button"
                className="auth-link-subtle"
                onClick={onBackToLogin}
              >
                ← Volver a inicio de sesión
              </button>
            </div>
          )}
        </form>
      )}

      {error !== null && (
        <p role="alert" className="auth-alert-air">
          {error}
        </p>
      )}

      {/* The cute Peeking Dog companion */}
      <PeekingDog
        focusedField={focusedField}
        hasError={error !== null}
        isSubmitting={isSubmitting}
      />
    </main>
  );
}
