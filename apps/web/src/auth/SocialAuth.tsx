import { supabase } from "../lib/supabase.js";
import { useAuthMood } from "./AuthMood.js";
import { GoogleIcon } from "./icons.js";
import { authCopy } from "./messages.js";

// Apple stays hidden: it needs a paid Apple developer account (docs/frontend/auth-role.md).
type Provider = "google";

export const PENDING_ROLE_KEY = "cantrack.pendingRole";

type SocialAuthProps = {
  divider: string;
  /** Role picked on the signup form; kept so it can be applied after the OAuth redirect. */
  role?: "walker" | "owner";
  onError: (message: string) => void;
};

/** "or continue with" row: Google and Apple through Supabase OAuth. */
export function SocialAuth({ divider, role, onError }: SocialAuthProps) {
  const { setMood } = useAuthMood();

  async function handleProvider(provider: Provider) {
    setMood("submitting");
    if (role !== undefined) {
      try {
        window.localStorage.setItem(PENDING_ROLE_KEY, role);
      } catch {
        // Storage can be blocked; the account then simply starts without a role.
      }
    }
    try {
      const response = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (response.error !== null) {
        onError(authCopy.errors.oauth);
        setMood("error");
      }
    } catch {
      onError(authCopy.errors.oauth);
      setMood("error");
    }
  }

  return (
    <div className="auth-social">
      <p className="auth-social__divider"><span>{divider}</span></p>
      <div className="auth-social__row">
        <button type="button" className="auth-social__button" aria-label="Continuar con Google" onClick={() => void handleProvider("google")}>
          <GoogleIcon />
          Google
        </button>
      </div>
    </div>
  );
}
