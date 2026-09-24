import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  LoginScreen,
  ResetPasswordScreen,
  SignupScreen,
} from "./auth/AuthScreens.js";
import { OwnerDogsScreen } from "./owner/OwnerDogsScreen.js";
import { WalkerRouteScreen } from "./walker/WalkerRouteScreen.js";
import { fetchRoutes, type Route } from "./lib/api.js";
import { supabase } from "./lib/supabase.js";
import "./app-shell.css";

type AuthView = "signup" | "login" | "reset";

const routeToneNames = ["mint", "coral", "yellow", "sky", "green"] as const;

function getRouteToneClass(index: number): string {
  return `route-card--${routeToneNames[index % routeToneNames.length] ?? "mint"}`;
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

function AuthShell() {
  const [view, setView] = useState<AuthView>("signup");

  return (
    <div className="app-shell__panel app-shell__panel--auth auth-panel auth-panel--mint">
      <header className="app-shell__brand">
        <span className="app-shell__brand-mark" aria-hidden="true">C</span>
        <div>
          <p className="app-shell__eyebrow">Neighbourhood walks</p>
          <h1 className="app-shell__brand-name">CanTrack</h1>
        </div>
      </header>
      <nav className="auth-switcher" aria-label="Account access">
        <button
          type="button"
          aria-pressed={view === "signup"}
          onClick={() => setView("signup")}
        >
          Sign up
        </button>
        <button
          type="button"
          aria-pressed={view === "login"}
          onClick={() => setView("login")}
        >
          Log in
        </button>
        <button
          type="button"
          aria-pressed={view === "reset"}
          onClick={() => setView("reset")}
        >
          Reset
        </button>
      </nav>
      {view === "signup" ? <SignupScreen /> : null}
      {view === "login" ? <LoginScreen /> : null}
      {view === "reset" ? <ResetPasswordScreen /> : null}
    </div>
  );
}

function RouteList({ onOpen }: { onOpen: (route: Route) => void }) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void fetchRoutes()
      .then((loadedRoutes) => {
        if (isMounted) {
          setRoutes(loadedRoutes);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(getErrorMessage(loadError, "Unable to load your routes."));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="route-dashboard route-dashboard--sky">
      <header className="route-dashboard__header">
        <div>
          <p className="app-shell__eyebrow">Today’s schedule</p>
          <h1>Your routes</h1>
        </div>
        <span className="route-dashboard__count" aria-label={`${routes.length} routes`}>
          {routes.length}
        </span>
      </header>

      {isLoading ? <p className="app-shell__status">Loading routes...</p> : null}
      {error !== null ? <p className="app-shell__alert" role="alert">{error}</p> : null}
      {!isLoading && error === null && routes.length === 0 ? (
        <div className="route-empty">
          <span className="route-empty__badge" aria-hidden="true">0</span>
          <h2>No routes scheduled</h2>
          <p>Your next walk will appear here when it is ready.</p>
        </div>
      ) : null}

      {routes.length > 0 ? (
        <ol className="route-list" aria-label="Your routes">
          {routes.map((route, routeIndex) => {
            const firstDog = route.stops[0]?.dogName ?? route.stops[0]?.dogId;
            const stopLabel = `${route.stops.length} ${route.stops.length === 1 ? "stop" : "stops"}`;

            return (
              <li key={route.id}>
                <button
                  className={`route-card ${getRouteToneClass(routeIndex)}`}
                  type="button"
                  onClick={() => onOpen(route)}
                >
                  <span className="route-card__order" aria-hidden="true">
                    {String(routeIndex + 1).padStart(2, "0")}
                  </span>
                  <span className="route-card__content">
                    <strong>{route.id}</strong>
                    <span>{firstDog ?? "First dog pending"}</span>
                    <small>{stopLabel}</small>
                  </span>
                  <span className="route-card__arrow" aria-hidden="true">→</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

function WalkerDashboard() {
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

  if (selectedRoute !== null) {
    return (
      <div className="app-shell__panel route-detail route-detail--sky">
        <button
          className="route-detail__back"
          type="button"
          onClick={() => setSelectedRoute(null)}
        >
          <span aria-hidden="true">←</span> All routes
        </button>
        <WalkerRouteScreen routeId={selectedRoute.id} initialRoute={selectedRoute} />
      </div>
    );
  }

  return (
    <div className="app-shell__panel app-shell__panel--routes">
      <RouteList onOpen={setSelectedRoute} />
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [authError, setAuthError] = useState<string | null>(null);
  const shellRef = useAppShellMount();

  useEffect(() => {
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
  }, []);

  if (session === undefined) {
    return (
      <div ref={shellRef} className="app-shell app-shell--centered" data-cantrack-app-shell>
        <div className="app-shell__panel app-shell__status" role="status">
          Loading CanTrack...
        </div>
      </div>
    );
  }

  const role = session?.user.user_metadata.role;

  return (
    <div ref={shellRef} className="app-shell" data-cantrack-app-shell>
      {session !== null ? (
        <button
          className="app-shell__logout"
          type="button"
          onClick={() => void supabase.auth.signOut()}
        >
          Log out
        </button>
      ) : null}
      {authError !== null ? <p className="app-shell__alert" role="alert">{authError}</p> : null}
      {session === null ? <AuthShell /> : null}
      {role === "owner" ? (
        <div className="app-shell__panel app-shell__panel--owner">
          <OwnerDogsScreen />
        </div>
      ) : null}
      {role === "walker" ? <WalkerDashboard /> : null}
      {session !== null && role !== "owner" && role !== "walker" ? (
        <div className="app-shell__panel app-shell__status" role="alert">
          This account does not have a walker or owner role.
        </div>
      ) : null}
    </div>
  );
}
