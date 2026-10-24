import { createContext, useContext } from "react";

/** What the user is doing on the auth screens; the characters react to it. */
export type AuthMood =
  | "idle"
  | "email"
  | "password"
  | "owner"
  | "walker"
  | "reset"
  | "submitting"
  | "error"
  | "success";

export type UserRole = "walker" | "owner";

export type AuthView = "role" | "signup" | "login" | "reset";

export type AuthMoodValue = {
  mood: AuthMood;
  setMood: (mood: AuthMood) => void;
  /** Switches the visible auth screen (role -> signup <-> login <-> reset). */
  navigate: (view: AuthView) => void;
  /** Role picked on the role screen; undefined when the screens render on their own. */
  role: UserRole | undefined;
  setRole: (role: UserRole) => void;
};

/** Defaults are no-ops so the auth screens also work rendered on their own. */
export const AuthMoodContext = createContext<AuthMoodValue>({
  mood: "idle",
  setMood: () => {},
  navigate: () => {},
  role: undefined,
  setRole: () => {},
});

export function useAuthMood(): AuthMoodValue {
  return useContext(AuthMoodContext);
}
