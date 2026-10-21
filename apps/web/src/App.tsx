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
  const [view, setView] = useState<AuthView>(() => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("view");
      if (param === "login" || param === "signup" || param === "reset") {
        return param;
      }
    }
    return "login";
  });

  return (
    <div className="air-hero-grid">
      {/* Left Column: Air Atmospheric Presentation & Telemetry */}
      <section className="air-hero-info">
        <div className="air-eyebrow">CANTRACK · CANINE OPERATIONS SYSTEM</div>
        <h1 className="air-hero-title">
          The workspace for <span className="air-cursive">canine care</span>
        </h1>
        <p className="air-hero-description">
          Real-time GPS telemetry, biometric dog recognition, and Dijkstra route optimization powered by custom university data structures.
        </p>

        <div className="air-stats-grid">
          <div className="air-stat-card">
            <span className="air-stat-value">3</span>
            <span className="air-stat-label">Perros en base de datos</span>
            <span className="air-stat-sub">Rocky, Luna & Max</span>
          </div>
          <div className="air-stat-card">
            <span className="air-stat-value">:3000</span>
            <span className="air-stat-label">FastAPI Backend</span>
            <span className="air-stat-sub">Conectado y respondiendo</span>
          </div>
          <div className="air-stat-card">
            <span className="air-stat-value">Dijkstra</span>
            <span className="air-stat-label">Rutas Óptimas</span>
            <span className="air-stat-sub">Grafos ponderados</span>
          </div>
        </div>

        <div className="air-feature-list">
          <div className="air-feature-item">
            <span className="air-feature-dot"></span>
            <span>Pilas (Stack) para reversión de check-in instantánea</span>
          </div>
          <div className="air-feature-item">
            <span className="air-feature-dot"></span>
            <span>Colas (Queue) para solicitudes de paseo en orden FIFO</span>
          </div>
          <div className="air-feature-item">
            <span className="air-feature-dot"></span>
            <span>Listas circulares y dobles para seguimiento continuo</span>
          </div>
        </div>
      </section>

      {/* Right Column: Air Haze Card for Login/Signup */}
      <div className="air-card-column">
        <div className="air-haze-card">
          <div className="air-card-topbar">
            <div className="air-card-title-group">
              <span className="air-card-badge">ACCESO A LA PLATAFORMA</span>
              <h2 className="air-card-heading">
                {view === "login" ? "Iniciar Sesión" : view === "signup" ? "Crear Cuenta" : "Recuperar Acceso"}
              </h2>
            </div>
            <nav className="auth-switcher" aria-label="Account access">
              <Pill active={view === "login"} onClick={() => { playTap(480); setView("login"); }}>
                Log in
              </Pill>
              <Pill active={view === "signup"} onClick={() => { playTap(480); setView("signup"); }}>
                Sign up
              </Pill>
              <Pill active={view === "reset"} onClick={() => { playTap(480); setView("reset"); }}>
                Reset
              </Pill>
            </nav>
          </div>

          <div className="air-card-body">
            {view === "signup" ? <SignupScreen onSwitchToLogin={() => setView("login")} /> : null}
            {view === "login" ? <LoginScreen onForgotPassword={() => setView("reset")} /> : null}
            {view === "reset" ? <ResetPasswordScreen onBackToLogin={() => setView("login")} /> : null}
          </div>
        </div>
      </div>
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

    function handleDemoLogin(event: Event) {
      const customEvent = event as CustomEvent<Session>;
      if (customEvent.detail && isMounted) {
        setSession(customEvent.detail);
        setAuthError(null);
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("cantrack-demo-login", handleDemoLogin);
      try {
        const saved = localStorage.getItem("cantrack_demo_session");
        if (saved && session === undefined) {
          setSession(JSON.parse(saved));
        }
      } catch {
        // ignore storage error
      }
    }

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

        if (isMounted && currentSession !== null) {
          setSession(currentSession);
        } else if (isMounted && session === undefined) {
          setSession(null);
        }
      })
      .catch((_error: unknown) => {
        if (isMounted) {
          // If no active remote session or offline, simply treat as logged out
          setSession((prev) => (prev !== undefined ? prev : null));
        }
      });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("cantrack-demo-login", handleDemoLogin);
      }
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
    <div ref={shellRef} className="air-root-layout" data-cantrack-app-shell>
      {/* Air Top Navigation Bar */}
      <header className="air-nav-header">
        <div className="air-nav-left">
          <a href="/" className="air-nav-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="12 8 8 12 12 16 16 12 12 8" />
            </svg>
            <span className="air-nav-brand">CanTrack</span>
          </a>
          <span className="air-nav-divider">/</span>
          <span className="air-nav-section">Operations</span>
        </div>

        <nav className="air-nav-links">
          <span className="air-nav-tag">FastAPI :3000 Online</span>
          <span className="air-nav-tag">Local DB</span>
          <span className="air-nav-tag">Dijkstra Telemetry</span>
        </nav>

        <div className="air-nav-right">
          <button
            type="button"
            className="air-ghost-button air-sound-btn"
            onClick={() => {
              const next = toggleAudio();
              setSoundOn(next);
            }}
            title={soundOn ? "Silenciar audio" : "Activar audio"}
          >
            {soundOn ? "🔊 Audio" : "🔇 Mute"}
          </button>

          {session === null ? (
            <div className="air-nav-actions">
              <button
                type="button"
                className="air-ghost-button"
                onClick={() => {
                  const demoSession = {
                    access_token: "demo-token",
                    user: { id: "demo-walker-1", email: "walker@cantrack.app", user_metadata: { role: "walker" } },
                  };
                  localStorage.setItem("cantrack_demo_session", JSON.stringify(demoSession));
                  setSession(demoSession as any);
                }}
              >
                Demo Paseador
              </button>
              <button
                type="button"
                className="air-solid-button"
                onClick={() => {
                  const demoSession = {
                    access_token: "demo-token",
                    user: { id: "demo-owner-1", email: "owner@cantrack.app", user_metadata: { role: "owner" } },
                  };
                  localStorage.setItem("cantrack_demo_session", JSON.stringify(demoSession));
                  setSession(demoSession as any);
                }}
              >
                Demo Dueño
              </button>
            </div>
          ) : (
            <div className="air-user-menu">
              <span className="air-role-badge">{role === "owner" ? "Dueño" : "Paseador"}</span>
              <span className="air-user-email">{session.user.email}</span>
              <button
                type="button"
                className="air-ghost-button air-logout-button"
                onClick={() => {
                  try {
                    localStorage.removeItem("cantrack_demo_session");
                  } catch {}
                  void supabase.auth.signOut();
                  setSession(null);
                }}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      {authError !== null ? (
        <div className="air-alert-container">
          <p className="app-shell__alert" role="alert">{authError}</p>
        </div>
      ) : null}

      <main className="air-main-container">
        {session === null ? <AuthShell /> : null}
        {role === "owner" ? <OwnerShell /> : null}
        {role === "walker" ? <WalkerShell userId={userId} /> : null}
        {session !== null && role !== "owner" && role !== "walker" ? (
          <div className="air-status-box" role="alert">
            Esta cuenta no tiene asignado un rol de paseador o dueño.
          </div>
        ) : null}
      </main>
    </div>
  );
}
