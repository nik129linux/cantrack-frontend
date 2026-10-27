import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthShell } from "./auth/AuthShell.js";
import { PENDING_ROLE_KEY } from "./auth/SocialAuth.js";
import { OwnerActivityScreen } from "./owner/OwnerActivityScreen.js";
import { OwnerExploreScreen } from "./owner/OwnerExploreScreen.js";
import { OwnerDogsScreen } from "./owner/OwnerDogsScreen.js";
import { WalkerClientsScreen } from "./walker/WalkerClientsScreen.js";
import { WalkerInboxScreen } from "./walker/WalkerInboxScreen.js";
import { WalkerOffersScreen } from "./walker/WalkerOffersScreen.js";
import { WalkerPlanPanel } from "./walker/WalkerPlanPanel.js";
import { WalkerProfileScreen } from "./walker/WalkerProfileScreen.js";
import { WalkerRouteScreen } from "./walker/WalkerRouteScreen.js";
import { fetchRoutes, type Route } from "./lib/api.js";
import { formatWhen } from "./lib/format.js";
import { readPreviewSession } from "./lib/preview.js";
import { supabase } from "./lib/supabase.js";
import { Banner } from "./ui/Banner.js";
import { DogLoader } from "./ui/DogLoader.js";
import { HomeShell } from "./home/HomeDashboard.js";
import { Button } from "./ui/Button.js";
import { EmptyState } from "./ui/EmptyState.js";
import { ListRow } from "./ui/ListRow.js";
import { ClockIcon } from "./ui/icons.js";
import "./ui/tokens.css";
import "./app-shell.css";

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
      />

      {isLoading ? <p className="app-shell__status">Loading routes...</p> : null}
      {error !== null ? <p className="app-shell__alert" role="alert">{error}</p> : null}
      {!isLoading && error === null && routes.length === 0 ? (
        <EmptyState
          title="No routes scheduled"
          message="Your next walk will appear here when it is ready."
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

function WalkerShell({ userId, onLogout }: { userId: string; onLogout: () => void }) {
  return (
    <HomeShell
      role="walker"
      onLogout={onLogout}
      screens={{
        requests: (
          <>
            <WalkerOffersScreen />
            <WalkerInboxScreen />
          </>
        ),
        clients: <WalkerClientsScreen />,
        routes: <WalkerDashboard />,
        profile: <WalkerProfileScreen userId={userId} />,
      }}
    />
  );
}

function OwnerShell({ onLogout }: { onLogout: () => void }) {
  return (
    <HomeShell
      role="owner"
      onLogout={onLogout}
      screens={{
        explore: <OwnerExploreScreen />,
        dogs: <OwnerDogsScreen />,
        walks: <OwnerActivityScreen />,
        profile: <ComingSoon section="Profile" />,
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

  // An OAuth signup arrives without a role; apply the one picked before the redirect.
  useEffect(() => {
    if (session === null || session === undefined) {
      return;
    }
    const metadataRole = session.user.user_metadata.role;
    if (metadataRole === "owner" || metadataRole === "walker") {
      return;
    }
    const pendingRole = readPendingRole();
    if (pendingRole === null) {
      return;
    }
    void supabase.auth
      .updateUser({ data: { role: pendingRole } })
      .then(() => window.localStorage.removeItem(PENDING_ROLE_KEY))
      .catch(() => undefined);
  }, [session]);

  if (session === undefined) {
    return (
      <div ref={shellRef} className="app-shell app-shell--centered" data-cantrack-app-shell>
        <DogLoader label="Cargando CanTrack…" />
      </div>
    );
  }

  const role = session?.user.user_metadata.role;
  const userId = session?.user.id ?? "";
  const hasKnownRole = role === "owner" || role === "walker";
  const logout = () =>
    preview !== null ? window.location.assign(window.location.pathname) : void supabase.auth.signOut();

  return (
    <div ref={shellRef} className="app-shell" data-cantrack-app-shell>
      {session !== null && !hasKnownRole ? (
        <div className="app-shell__topbar">
          <span className="app-shell__eyebrow">CanTrack</span>
          <Button
            className="app-shell__logout"
            variant="ghost"
            onClick={logout}
          >
            Log out
          </Button>
        </div>
      ) : null}
      {authError !== null ? <p className="app-shell__alert" role="alert">{authError}</p> : null}
      {session === null ? <AuthShell /> : null}
      {role === "owner" ? <OwnerShell onLogout={logout} /> : null}
      {role === "walker" ? <WalkerShell userId={userId} onLogout={logout} /> : null}
      {session !== null && !hasKnownRole ? (
        <div className="app-shell__panel app-shell__status" role="alert">
          This account does not have a walker or owner role.
        </div>
      ) : null}
    </div>
  );
}
