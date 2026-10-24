import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase.js";
import { Button } from "../ui/Button.js";
import { AuthField } from "./AuthField.js";
import { useAuthMood, type UserRole } from "./AuthMood.js";
import {
  ArrowRightIcon,
  CameraIcon,
  ClockIcon,
  LockIcon,
  MailIcon,
  PhoneIcon,
  PinIcon,
  RouteIcon,
  ShieldIcon,
  UserIcon,
  WalletIcon,
} from "./icons.js";
import { authCopy, translateAuthError } from "./messages.js";
import { SocialAuth } from "./SocialAuth.js";

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

function ScreenHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="auth-card__heading">
      <h1 className="auth-card__title">{title}</h1>
      <p className="auth-card__subtitle">{subtitle}</p>
    </header>
  );
}

function SwitchLine({ prompt, action, onClick }: { prompt: string; action: string; onClick: () => void }) {
  return (
    <p className="auth-card__switch">
      {prompt}{" "}
      <button type="button" className="auth-link" onClick={onClick}>{action}</button>
    </p>
  );
}

const perkIcons = {
  owner: [<PinIcon key="pin" />, <CameraIcon key="camera" />, <ShieldIcon key="shield" />],
  walker: [<ClockIcon key="clock" />, <RouteIcon key="route" />, <WalletIcon key="wallet" />],
} as const;

/** First screen: pick a profile before any account form shows up. */
export function RoleScreen() {
  const { setMood, navigate, role, setRole } = useAuthMood();
  const screenRef = useAuthScreenMount();
  const roles: UserRole[] = ["owner", "walker"];

  // On short screens the Continue button sits below the fold; bring it into view once a role is picked.
  useEffect(() => {
    const button = screenRef.current?.querySelector(".auth-submit");
    if (role === undefined || !button || typeof button.scrollIntoView !== "function") {
      return;
    }
    button.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [role, screenRef]);

  function choose(next: UserRole) {
    setRole(next);
    setMood(next);
  }

  return (
    <main ref={screenRef} data-cantrack-auth-screen>
      <ScreenHeading title={authCopy.role.title} subtitle={authCopy.role.subtitle} />
      <fieldset className="role-cards">
        <legend className="sr-only">{authCopy.role.legend}</legend>
        {roles.map((option) => (
          <div key={option} className="role-card-wrap">
            <input
              id={`role-${option}`}
              className="role-card__input"
              type="radio"
              name="profile"
              value={option}
              checked={role === option}
              onChange={() => choose(option)}
            />
            <label className="role-card" data-role={option} htmlFor={`role-${option}`}>
              <img
                className="role-card__art"
                src={option === "owner" ? "/art/characters/dog-happy.webp" : "/art/characters/walker-thumbs.webp"}
                alt=""
                draggable={false}
              />
              <span className="role-card__body">
                <span className="role-card__title">{authCopy.role[option].title}</span>
                <span className="role-card__text">{authCopy.role[option].text}</span>
                <span className="role-card__perks">
                  {authCopy.role[option].perks.map((perk, index) => (
                    <span key={perk} className="role-card__perk">
                      {perkIcons[option][index]}
                      {perk}
                    </span>
                  ))}
                </span>
              </span>
            </label>
          </div>
        ))}
      </fieldset>
      <Button
        type="button"
        className="auth-submit"
        disabled={role === undefined}
        onClick={() => navigate("signup")}
      >
        {authCopy.role.next}
        <ArrowRightIcon />
      </Button>
      <SwitchLine
        prompt={authCopy.role.haveAccount}
        action={authCopy.role.goLogin}
        onClick={() => navigate("login")}
      />
    </main>
  );
}

export function SignupScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pickedRole, setPickedRole] = useState<UserRole>("walker");
  const [hasConsent, setHasConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const screenRef = useAuthScreenMount();
  const { setMood, navigate, role: flowRole } = useAuthMood();
  // Inside the auth flow the role comes from the role screen; on its own the form asks for it.
  const role = flowRole ?? pickedRole;

  function fail(message: string) {
    setError(message);
    setMood("error");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsDone(false);

    if (!hasConsent) {
      fail(authCopy.errors.consentRequired);
      return;
    }

    if (email.trim().length === 0) {
      fail(authCopy.errors.emailRequired);
      return;
    }

    if (password.length === 0) {
      fail(authCopy.errors.passwordRequired);
      return;
    }

    setIsSubmitting(true);
    setMood("submitting");
    try {
      const response = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            role,
            ...(fullName.trim().length > 0 ? { full_name: fullName.trim() } : {}),
            ...(phone.trim().length > 0 ? { phone: phone.trim() } : {}),
          },
        },
      });

      if (response.error !== null) {
        fail(translateAuthError(response.error, authCopy.errors.signup));
      } else {
        setIsDone(true);
        setMood("success");
      }
    } catch (submissionError) {
      fail(translateAuthError(submissionError, authCopy.errors.signup));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main ref={screenRef} data-cantrack-auth-screen>
      {flowRole !== undefined && (
        <p className="auth-role-chip">
          <span>{authCopy.role.registeringAs}</span>
          <strong>{authCopy.role.chip[flowRole]}</strong>
          <button type="button" className="auth-link" onClick={() => navigate("role")}>
            {authCopy.role.change}
          </button>
        </p>
      )}
      <ScreenHeading title={authCopy.signup.title} subtitle={authCopy.signup.subtitle} />
      <form onSubmit={handleSubmit} noValidate>
        <AuthField
          id="signup-name"
          name="name"
          label={authCopy.fields.name}
          icon={<UserIcon />}
          autoComplete="name"
          value={fullName}
          onChange={setFullName}
          onFocus={() => setMood("email")}
          onBlur={() => setMood("idle")}
        />
        <AuthField
          id="signup-email"
          name="email"
          label={authCopy.fields.email}
          icon={<MailIcon />}
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          onFocus={() => setMood("email")}
          onBlur={() => setMood("idle")}
        />
        <AuthField
          id="signup-phone"
          name="phone"
          label={authCopy.fields.phone}
          icon={<PhoneIcon />}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={setPhone}
          onFocus={() => setMood("email")}
          onBlur={() => setMood("idle")}
        />
        <AuthField
          id="signup-password"
          name="password"
          label={authCopy.fields.password}
          icon={<LockIcon />}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          onFocus={() => setMood("password")}
          onBlur={() => setMood("idle")}
        />
        {flowRole === undefined && (
          <fieldset className="role-picker">
            <legend>{authCopy.fields.role}</legend>
            <input
              id="signup-role-walker"
              className="role-picker__input role-picker__input--walker"
              name="role"
              type="radio"
              value="walker"
              checked={pickedRole === "walker"}
              onChange={() => {
                setPickedRole("walker");
                setMood("walker");
              }}
            />
            <label
              className="role-picker__label role-picker__label--walker"
              htmlFor="signup-role-walker"
            >
              {authCopy.fields.walker}
            </label>
            <input
              id="signup-role-owner"
              className="role-picker__input role-picker__input--owner"
              name="role"
              type="radio"
              value="owner"
              checked={pickedRole === "owner"}
              onChange={() => {
                setPickedRole("owner");
                setMood("owner");
              }}
            />
            <label
              className="role-picker__label role-picker__label--owner"
              htmlFor="signup-role-owner"
            >
              {authCopy.fields.owner}
            </label>
          </fieldset>
        )}
        <label className="auth-consent" htmlFor="signup-consent">
          <input
            id="signup-consent"
            className="auth-consent__box"
            type="checkbox"
            checked={hasConsent}
            onChange={(event) => setHasConsent(event.target.checked)}
          />
          <span>{authCopy.signup.consent}</span>
        </label>
        <Button type="submit" className="auth-submit" disabled={isSubmitting}>
          {isSubmitting ? authCopy.signup.submitting : authCopy.signup.submit}
        </Button>
      </form>
      {error !== null && <p className="auth-card__message auth-card__message--error" role="alert">{error}</p>}
      {isDone && <p className="auth-card__message" role="status">{authCopy.signup.done}</p>}
      <SocialAuth divider={authCopy.signup.divider} role={role} onError={fail} />
      <SwitchLine
        prompt={authCopy.signup.haveAccount}
        action={authCopy.signup.goLogin}
        onClick={() => navigate("login")}
      />
    </main>
  );
}

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const screenRef = useAuthScreenMount();
  const { setMood, navigate } = useAuthMood();

  function fail(message: string) {
    setError(message);
    setMood("error");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (email.trim().length === 0) {
      fail(authCopy.errors.emailRequired);
      return;
    }

    if (password.length === 0) {
      fail(authCopy.errors.passwordRequired);
      return;
    }

    setIsSubmitting(true);
    setMood("submitting");
    try {
      const response = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (response.error !== null) {
        fail(translateAuthError(response.error, authCopy.errors.login));
      } else {
        setMood("success");
      }
    } catch (submissionError) {
      fail(translateAuthError(submissionError, authCopy.errors.login));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main ref={screenRef} data-cantrack-auth-screen>
      <ScreenHeading title={authCopy.login.title} subtitle={authCopy.login.subtitle} />
      <form onSubmit={handleSubmit} noValidate>
        <AuthField
          id="login-email"
          name="email"
          label={authCopy.fields.email}
          icon={<MailIcon />}
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          onFocus={() => setMood("email")}
          onBlur={() => setMood("idle")}
        />
        <AuthField
          id="login-password"
          name="password"
          label={authCopy.fields.password}
          icon={<LockIcon />}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          onFocus={() => setMood("password")}
          onBlur={() => setMood("idle")}
        />
        <p className="auth-card__aside">
          <button type="button" className="auth-link" onClick={() => navigate("reset")}>
            {authCopy.login.forgot}
          </button>
        </p>
        <Button type="submit" className="auth-submit" disabled={isSubmitting}>
          {isSubmitting ? authCopy.login.submitting : authCopy.login.submit}
        </Button>
      </form>
      {error !== null && <p className="auth-card__message auth-card__message--error" role="alert">{error}</p>}
      <SocialAuth divider={authCopy.login.divider} onError={fail} />
      <SwitchLine
        prompt={authCopy.login.noAccount}
        action={authCopy.login.goSignup}
        onClick={() => navigate("signup")}
      />
    </main>
  );
}

export function ResetPasswordScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const screenRef = useAuthScreenMount();
  const { setMood, navigate } = useAuthMood();

  function fail(message: string) {
    setError(message);
    setMood("error");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSent(false);

    if (email.trim().length === 0) {
      fail(authCopy.errors.emailRequired);
      return;
    }

    setIsSubmitting(true);
    setMood("submitting");
    try {
      const response = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (response.error !== null) {
        fail(translateAuthError(response.error, authCopy.errors.reset));
      } else {
        setIsSent(true);
        setMood("success");
      }
    } catch (submissionError) {
      fail(translateAuthError(submissionError, authCopy.errors.reset));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main ref={screenRef} data-cantrack-auth-screen>
      <ScreenHeading title={authCopy.reset.title} subtitle={authCopy.reset.subtitle} />
      {isSent ? (
        <p className="auth-card__message" role="status">{authCopy.reset.sent}</p>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <AuthField
            id="reset-email"
            name="email"
            label={authCopy.fields.email}
            icon={<MailIcon />}
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            onFocus={() => setMood("email")}
            onBlur={() => setMood("reset")}
          />
          <Button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? authCopy.reset.submitting : authCopy.reset.submit}
          </Button>
        </form>
      )}
      {error !== null && <p className="auth-card__message auth-card__message--error" role="alert">{error}</p>}
      <p className="auth-card__switch">
        <button type="button" className="auth-link" onClick={() => navigate("login")}>
          {authCopy.reset.back}
        </button>
      </p>
    </main>
  );
}
