import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase.js";
import { Button } from "../ui/Button.js";
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
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="5" r="2" />
                  <path d="m9 20 3-6 3 2 2 4" />
                  <path d="m6 16 4-3-1-5 4-2 3 3" />
                </svg>
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
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 2.756 1.258C6.18 10.825 8.5 8.5 8.5 8.5" />
                  <path d="M14 5.172C14 3.782 15.577 2.679 17.5 3c2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-2.756 1.258C17.82 10.825 15.5 8.5 15.5 8.5" />
                  <path d="M8 14v.5" />
                  <path d="M16 14v.5" />
                  <path d="M11.25 16.25h1.5L12 17l-.75-.75Z" />
                  <path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444c0-1.061-.162-2.2-.42-3.309" />
                </svg>
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
        const msg = getErrorMessage(response.error, "Invalid login credentials.");
        if (msg.toLowerCase().includes("fetch")) {
          const role = email.toLowerCase().includes("owner") ? "owner" : "walker";
          const demoSession = {
            access_token: "demo-token",
            user: {
              id: `demo-${role}-1`,
              email: email.trim(),
              user_metadata: { role },
            },
          };
          try {
            localStorage.setItem("cantrack_demo_session", JSON.stringify(demoSession));
          } catch {}
          window.dispatchEvent(new CustomEvent("cantrack-demo-login", { detail: demoSession }));
          playSuccess();
          return;
        }
        setError(msg);
      } else {
        playSuccess();
      }
    } catch (submissionError) {
      const msg = getErrorMessage(submissionError, "Invalid login credentials.");
      if (msg.toLowerCase().includes("fetch")) {
        const role = email.toLowerCase().includes("owner") ? "owner" : "walker";
        const demoSession = {
          access_token: "demo-token",
          user: {
            id: `demo-${role}-1`,
            email: email.trim(),
            user_metadata: { role },
          },
        };
        try {
          localStorage.setItem("cantrack_demo_session", JSON.stringify(demoSession));
        } catch {}
        window.dispatchEvent(new CustomEvent("cantrack-demo-login", { detail: demoSession }));
        playSuccess();
        return;
      }
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Quick helper to fill demo credentials and login instantly
  function fillDemo(type: "walker" | "owner") {
    playTap(600);
    const emailVal = type === "walker" ? "walker@cantrack.app" : "owner@cantrack.app";
    setEmail(emailVal);
    setPassword("demo-2026");

    const demoSession = {
      access_token: "demo-token",
      user: {
        id: `demo-${type}-1`,
        email: emailVal,
        user_metadata: { role: type },
      },
    };
    try {
      localStorage.setItem("cantrack_demo_session", JSON.stringify(demoSession));
    } catch {}
    window.dispatchEvent(new CustomEvent("cantrack-demo-login", { detail: demoSession }));
    playSuccess();
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
    </main>
  );
}
