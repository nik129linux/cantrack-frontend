import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  LoginScreen,
  ResetPasswordScreen,
  SignupScreen,
} from "./auth/AuthScreens.js";
import { OwnerActivityScreen } from "./owner/OwnerActivityScreen.js";
import { OwnerDiscoverScreen } from "./owner/OwnerDiscoverScreen.js";
import { OwnerDogsScreen } from "./owner/OwnerDogsScreen.js";
import { WalkerClientsScreen } from "./walker/WalkerClientsScreen.js";
import { WalkerInboxScreen } from "./walker/WalkerInboxScreen.js";
import { WalkerPlanPanel } from "./walker/WalkerPlanPanel.js";
import { WalkerProfileScreen } from "./walker/WalkerProfileScreen.js";
import { WalkerRouteScreen } from "./walker/WalkerRouteScreen.js";
import { fetchRoutes, type Route } from "./lib/api.js";
import { formatWhen } from "./lib/format.js";
import { supabase } from "./lib/supabase.js";
import { Banner } from "./ui/Banner.js";
import { BottomNav } from "./ui/BottomNav.js";
import { Button } from "./ui/Button.js";
import { EmptyState } from "./ui/EmptyState.js";
import { ListRow } from "./ui/ListRow.js";
import { Pill } from "./ui/Pill.js";
import { ClockIcon } from "./ui/icons.js";
import { playTap, isAudioEnabled, toggleAudio } from "./lib/sound.js";
import "./ui/tokens.css";
import "./app-shell.css";

type AuthView = "signup" | "login" | "reset";

const routeTintNames = ["mint", "peach", "butter", "sky", "sage"] as const;

function getRouteTint(index: number): string {
  return routeTintNames[index % routeTintNames.length] ?? "mint";
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
        <span className="app-shell__brand-mark" aria-hidden="true">🐾</span>
        <div>
          <p className="app-shell__eyebrow">Smart Canine Network</p>
          <h1 className="app-shell__brand-name">CanTrack</h1>
        </div>
      </header>
      <nav className="auth-switcher" aria-label="Account access">
        <Pill
          active={view === "signup"}
          onClick={() => {
            playTap(480);
            setView("signup");
          }}
        >
          Sign up
        </Pill>
        <Pill
          active={view === "login"}
          onClick={() => {
            playTap(480);
            setView("login");
          }}
        >
          Log in
        </Pill>
        <Pill
          active={view === "reset"}
          onClick={() => {
            playTap(480);
            setView("reset");
          }}
        >
          Reset
        </Pill>
      </nav>
      {view === "signup" ? <SignupScreen onSwitchToLogin={() => setView("login")} /> : null}
      {view === "login" ? <LoginScreen onForgotPassword={() => setView("reset")} /> : null}
      {view === "reset" ? <ResetPasswordScreen onBackToLogin={() => setView("login")} /> : null}
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
    <div className="route-dashboard">
      <Banner
        title="Your routes"
        subtitle={`Today’s schedule · ${routes.length} ${routes.length === 1 ? "route" : "routes"}`}
        tint="sky"
        character="walker"
      />

      {isLoading ? <p className="app-shell__status">Loading routes...</p> : null}
      {error !== null ? <p className="app-shell__alert" role="alert">{error}</p> : null}
      {!isLoading && error === null && routes.length === 0 ? (
        <EmptyState
          title="No routes scheduled"
          message="Your next walk will appear here when it is ready."
          character="walker"
        />
      ) : null}

      {routes.length > 0 ? (
        <ol className="route-list" aria-label="Your routes">
          {routes.map((route, routeIndex) => {
            const firstDog = route.stops[0]?.dogName ?? route.stops[0]?.dogId;
            const firstTime = route.stops[0]?.pickupTime;
            const stopLabel = `${route.stops.length} ${route.stops.length === 1 ? "stop" : "stops"}`;
            // Polish item 3 (S2): the card is titled with the first dog and the
            // formatted time — never the route UUID, never a raw ISO string.
            const subtitle = [firstTime ? formatWhen(firstTime) : null, stopLabel]
              .filter((part) => part !== null)
              .join(" · ");

            return (
              <li key={route.id}>
                <ListRow
                  data-tint={getRouteTint(routeIndex)}
                  icon={<ClockIcon />}
                  title={firstDog ?? "Route"}
                  subtitle={subtitle}
                  onClick={() => onOpen(route)}
                />
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
      <div className="route-detail">
        <Button
          className="route-detail__back"
          variant="ghost"
          onClick={() => setSelectedRoute(null)}
        >
          <span aria-hidden="true">←</span> All routes
        </Button>
        <WalkerRouteScreen routeId={selectedRoute.id} initialRoute={selectedRoute} />
      </div>
    );
  }

  return (
    <>
      <WalkerPlanPanel />
      <RouteList onOpen={setSelectedRoute} />
    </>
  );
}

/** Placeholder for the marketplace sections that later slices (S1-S5) build. */
function ComingSoon({ section }: { section: string }) {
  return (
    <EmptyState
      title="Coming soon"
      message={`The ${section} section lands in a later slice of the marketplace build.`}
    />
  );
}

function WalkerShell({ userId }: { userId: string }) {
  const [tab, setTab] = useState("Today");

  return (
    <div className="app-shell__content">
      <div className="app-shell__panel app-shell__panel--routes">
        {tab === "Today" ? <WalkerDashboard /> : null}
        {tab === "Requests" ? <WalkerInboxScreen /> : null}
        {tab === "Profile" ? <WalkerProfileScreen userId={userId} /> : null}
        {tab === "Clients" ? <WalkerClientsScreen /> : null}
      </div>
      <BottomNav role="walker" active={tab} onNavigate={setTab} />
    </div>
  );
}

function OwnerShell() {
  const [tab, setTab] = useState("My dogs");

  return (
    <div className="app-shell__content">
      <div className="app-shell__panel app-shell__panel--owner">
        {tab === "My dogs" ? <OwnerDogsScreen /> : null}
        {tab === "Discover" ? <OwnerDiscoverScreen /> : null}
        {tab === "Activity" ? <OwnerActivityScreen /> : null}
        {tab === "Profile" ? <ComingSoon section={tab} /> : null}
      </div>
      <BottomNav role="owner" active={tab} onNavigate={setTab} />
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [authError, setAuthError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
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
  const userId = session?.user.id ?? "";

  return (
    <div ref={shellRef} className="app-shell" data-cantrack-app-shell>
      <div className="ios-status-bar" aria-hidden="true">
        <span className="ios-status-bar__time">9:41</span>
        <div className="ios-dynamic-island">
          <span className="ios-dynamic-island__cam" />
          <span className="ios-dynamic-island__indicator">🐾</span>
        </div>
        <div className="ios-status-bar__icons">
          <span>📶</span>
          <span>📡</span>
          <span>🔋 100%</span>
        </div>
      </div>
      {session !== null ? (
        <div className="app-shell__topbar">
          <span className="app-shell__eyebrow">CanTrack</span>
          <button
            type="button"
            className="sound-toggle-btn"
            onClick={() => {
              const next = toggleAudio();
              setSoundOn(next);
            }}
            title={soundOn ? "Silenciar audio" : "Activar audio"}
          >
            {soundOn ? "🔊" : "🔇"}
          </button>
          <Button
            className="app-shell__logout"
            variant="ghost"
            onClick={() => void supabase.auth.signOut()}
          >
            Log out
          </Button>
        </div>
      ) : null}
      {authError !== null ? <p className="app-shell__alert" role="alert">{authError}</p> : null}
      {session === null ? <AuthShell /> : null}
      {role === "owner" ? <OwnerShell /> : null}
      {role === "walker" ? <WalkerShell userId={userId} /> : null}
      {session !== null && role !== "owner" && role !== "walker" ? (
        <div className="app-shell__panel app-shell__status" role="alert">
          This account does not have a walker or owner role.
        </div>
      ) : null}
    </div>
  );
}
