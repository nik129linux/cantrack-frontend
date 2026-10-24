import { useCallback, useEffect, useMemo, useState } from "react";
import { DogLoader } from "../ui/DogLoader.js";
import { AuthMoodContext, type AuthMood, type AuthView, type UserRole } from "./AuthMood.js";
import {
  LoginScreen,
  ResetPasswordScreen,
  RoleScreen,
  SignupScreen,
} from "./AuthScreens.js";
import { AuthStage } from "./AuthStage.js";
import { authCopy } from "./messages.js";
import "./auth.css";

/** How long the characters keep an error/success reaction before calming down. */
const REACTION_MS = 4200;

function AuthBackdrop() {
  return (
    <div className="auth-backdrop" aria-hidden="true">
      <div className="auth-backdrop__clouds auth-backdrop__clouds--left" />
      <div className="auth-backdrop__clouds auth-backdrop__clouds--right" />
    </div>
  );
}

export function AuthShell() {
  const [view, setView] = useState<AuthView>("role");
  const [mood, setMoodState] = useState<AuthMood>("idle");
  const [role, setRoleState] = useState<UserRole | undefined>(undefined);

  const setMood = useCallback((next: AuthMood) => setMoodState(next), []);
  const setRole = useCallback((next: UserRole) => setRoleState(next), []);
  const navigate = useCallback((next: AuthView) => {
    setView(next);
    setMoodState(next === "reset" ? "reset" : "idle");
  }, []);
  const moodValue = useMemo(
    () => ({ mood, setMood, navigate, role, setRole }),
    [mood, setMood, navigate, role, setRole],
  );

  useEffect(() => {
    if (mood !== "error" && mood !== "success") {
      return;
    }
    const id = window.setTimeout(() => setMoodState("idle"), REACTION_MS);
    return () => window.clearTimeout(id);
  }, [mood]);

  return (
    <AuthMoodContext.Provider value={moodValue}>
      <div className="auth-scene" data-cantrack-auth-scene>
        <AuthBackdrop />
        <div className="auth-layout">
          <div className="auth-hero">
            <p className="auth-wordmark">cantrack</p>
            <AuthStage mood={mood} />
          </div>
          <div className="auth-card">
            {view === "role" ? <RoleScreen /> : null}
            {view === "signup" ? <SignupScreen /> : null}
            {view === "login" ? <LoginScreen /> : null}
            {view === "reset" ? <ResetPasswordScreen /> : null}
            {mood === "submitting" ? (
              <div className="auth-card__loading">
                <DogLoader label={authCopy.loading[view]} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AuthMoodContext.Provider>
  );
}
