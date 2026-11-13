import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthShell } from "./auth/AuthShell.js";
import { PENDING_CONSENT_KEY } from "./auth/AuthScreens.js";
import { authCopy } from "./auth/messages.js";
import { PENDING_ROLE_KEY } from "./auth/SocialAuth.js";
import { OwnerProfileScreen } from "./owner/OwnerProfileScreen.js";
import { WalkerClientsScreen } from "./walker/WalkerClientsScreen.js";
import { WalkerProfileScreen } from "./walker/WalkerProfileScreen.js";
import { WalkerRequestsScreen } from "./walker/WalkerRequestsScreen.js";
import { WalkerRoutesScreen } from "./walker/WalkerRoutesScreen.js";
import { OwnerWalksScreen } from "./owner/OwnerWalksScreen.js";
import { OwnerExploreScreen } from "./owner/OwnerExploreScreen.js";
import { OwnerDogsScreen } from "./owner/OwnerDogsScreen.js";
import {
  logoutAccount,
  recordOwnerConsent,
  recordWalkerConsent,
  setAccountRole,
} from "./lib/marketplace.js";
import { readPreviewSession } from "./lib/preview.js";
import { supabase } from "./lib/supabase.js";
import { DogLoader } from "./ui/DogLoader.js";
import { beginFarewell } from "./mascot/mascotBus.js";
import { HomeShell } from "./home/HomeDashboard.js";
import { Button } from "./ui/Button.js";
import "./ui/tokens.css";
import "./app-shell.css";

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

function useAppShellMount() {
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shell = shellRef.current;
    if (shell === null || typeof document === "undefined") {
      return;
    }

    const container = shell.parentElement;
    if (container?.parentElement !== document.body) {
      return;
    }

    for (const child of Array.from(document.body.children)) {
      if (child !== container && child.querySelector("[data-cantrack-app-shell]") !== null) {
        child.remove();
      }
    }
  }, []);

  return shellRef;
}

function WalkerShell({
  userId,
  isPreview,
  onLogout,
  onSignOut,
}: {
  userId: string;
  isPreview: boolean;
  onLogout: () => void;
  onSignOut: (scope?: "global") => void;
}) {
  return (
    <HomeShell
      role="walker"
      userId={userId}
      preview={isPreview}
      onLogout={onLogout}
      screens={{
        requests: (go) => (
          <WalkerRequestsScreen userId={userId} onGoHome={() => go("home")} onGoRoutes={() => go("routes")} />
        ),
        clients: (go) => <WalkerClientsScreen userId={userId} onGoRoutes={() => go("routes")} />,
        routes: (go) => (
          <WalkerRoutesScreen userId={userId} preview={isPreview} onGoHome={() => go("home")} onGoRequests={() => go("requests")} />
        ),
        profile: <WalkerProfileScreen userId={userId} onSignOut={onSignOut} />,
      }}
    />
  );
}

function OwnerShell({
  userId,
  isPreview,
  onLogout,
  onSignOut,
}: {
  userId: string;
  isPreview: boolean;
  onLogout: () => void;
  onSignOut: (scope?: "global") => void;
}) {
  return (
    <HomeShell
      role="owner"
      userId={userId}
      preview={isPreview}
      onLogout={onLogout}
      onForbidden={onLogout}
      screens={{
        explore: (go) => <OwnerExploreScreen userId={userId} onPicked={() => go("walks")} onGo={go} />,
        dogs: (go) => <OwnerDogsScreen onGo={go} />,
        walks: (go) => <OwnerWalksScreen userId={userId} onRepeated={() => go("explore")} onGo={go} />,
        profile: (go) => <OwnerProfileScreen userId={userId} onSignOut={onSignOut} onGo={go} />,
      }}
    />
  );
}

/** Role chosen on the signup form before a Google/Apple redirect, if any. */
function readPendingRole(): "owner" | "walker" | null {
  try {
    const stored = window.localStorage.getItem(PENDING_ROLE_KEY);
    return stored === "owner" || stored === "walker" ? stored : null;
  } catch {
    return null;
  }
}

export function App() {
  const [preview] = useState(() => readPreviewSession());
  const [session, setSession] = useState<Session | null | undefined>(preview ?? undefined);
  const [authError, setAuthError] = useState<string | null>(null);
  const shellRef = useAppShellMount();

  useEffect(() => {
    if (preview !== null) {
      return;
    }

    let isMounted = true;
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isMounted) {
        setSession(nextSession);
        setAuthError(null);
      }
    });

    void supabase.auth
      .getSession()
      .then(({ data: { session: currentSession }, error }) => {
        if (error !== null && error !== undefined) {
          throw error;
        }

        if (isMounted) {
          setSession(currentSession);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setSession(null);
          setAuthError(getErrorMessage(error, "Unable to check your session."));
        }
      });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, [preview]);

  const sessionRole = session?.user.app_metadata?.role;

  // An OAuth signup arrives without a role: the API assigns the one picked before the redirect.
  // The role lives in app_metadata; user_metadata is never read or written.
  useEffect(() => {
    if (session === null || session === undefined || preview !== null) {
      return;
    }
    if (sessionRole === "owner" || sessionRole === "walker") {
      return;
    }
    // Accounts made before the API took over signup only carry the role in user_metadata.
    // It is sent as a hint, never trusted: the API assigns app_metadata.role itself.
    const legacy = session.user.user_metadata?.role;
    const legacyRole = legacy === "owner" || legacy === "walker" ? legacy : null;
    const pendingRole = readPendingRole() ?? legacyRole;
    if (pendingRole === null) {
      return;
    }
    void setAccountRole(pendingRole)
      .then(() => supabase.auth.refreshSession())
      .catch(() => setAuthError("No pudimos activar tu rol. Cierra sesión e inténtalo de nuevo."))
      .finally(() => {
        try {
          window.localStorage.removeItem(PENDING_ROLE_KEY);
        } catch {
          // Storage blocked: nothing to clean up.
        }
      });
  }, [session, sessionRole, preview]);

  // Right after the first login, send the consent ticked on the signup form (Ley 1581).
  useEffect(() => {
    if (session === null || session === undefined || preview !== null) {
      return;
    }
    if (sessionRole !== "owner" && sessionRole !== "walker") {
      return;
    }
    try {
      if (window.localStorage.getItem(PENDING_CONSENT_KEY) !== "1") {
        return;
      }
      window.localStorage.removeItem(PENDING_CONSENT_KEY);
    } catch {
      return;
    }
    // A walker's consent needs a saved profile (409 before it); Perfil asks again then.
    void (sessionRole === "owner"
      ? recordOwnerConsent(session.user.id)
      : recordWalkerConsent(session.user.id)
    ).catch(() => undefined);
  }, [session, sessionRole, preview]);

  if (session === undefined) {
    return (
      <div ref={shellRef} className="app-shell app-shell--centered" data-cantrack-app-shell>
        <DogLoader label="Cargando CanTrack…" pose="run" />
      </div>
    );
  }

  const role = sessionRole;
  const userId = session?.user.id ?? "";
  const hasKnownRole = role === "owner" || role === "walker";
  const logout = (scope?: "global") => {
    if (preview !== null) {
      window.location.assign(window.location.pathname);
      return;
    }
    // The dog waves over a frosted screen while the session really closes.
    const farewellDone = beginFarewell();
    void logoutAccount(scope)
      .catch(() => undefined)
      .finally(() => {
        void Promise.resolve(supabase.auth.signOut({ scope: "local" }))
          .catch(() => undefined)
          .finally(farewellDone);
      });
  };

  return (
    <div ref={shellRef} className="app-shell" data-cantrack-app-shell>
      {session !== null && !hasKnownRole ? (
        <div className="app-shell__topbar">
          <span className="app-shell__eyebrow">CanTrack</span>
          <Button
            className="app-shell__logout"
            variant="ghost"
            onClick={() => logout()}
          >
            Log out
          </Button>
        </div>
      ) : null}
      {session !== null && window.location.pathname === "/verificado" ? (
        <p className="app-shell__status" role="status">{authCopy.verify.activated}</p>
      ) : null}
      {authError !== null ? <p className="app-shell__alert" role="alert">{authError}</p> : null}
      {session === null ? <AuthShell /> : null}
      {role === "owner" ? <OwnerShell userId={userId} isPreview={preview !== null} onLogout={() => logout()} onSignOut={logout} /> : null}
      {role === "walker" ? <WalkerShell userId={userId} isPreview={preview !== null} onLogout={() => logout()} onSignOut={logout} /> : null}
      {session !== null && !hasKnownRole ? (
        <div className="app-shell__panel app-shell__status" role="alert">
          Tu cuenta aún no tiene un rol de dueño o paseador.
        </div>
      ) : null}
    </div>
  );
}
