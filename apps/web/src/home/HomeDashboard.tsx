import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  CompassIcon,
  HomeIcon,
  ListIcon,
  PawLineIcon,
  PersonIcon,
} from "./icons.js";
import type { HomeRole } from "./previewData.js";
import { WalkerHome } from "./WalkerHome.js";
import { OwnerHome } from "./OwnerHome.js";
import { WalkerPresenceProvider } from "../walker/presence.js";
import "../auth/auth.css";
import "./home.css";

type NavItem = { id: string; label: string; icon: ReactNode };

const NAV: Record<HomeRole, NavItem[]> = {
  owner: [
    { id: "home", label: "Inicio", icon: <HomeIcon /> },
    { id: "explore", label: "Explorar", icon: <CompassIcon /> },
    { id: "dogs", label: "Mis perros", icon: <PawLineIcon /> },
    { id: "walks", label: "Paseos", icon: <ListIcon /> },
    { id: "profile", label: "Perfil", icon: <PersonIcon /> },
  ],
  walker: [
    { id: "home", label: "Inicio", icon: <HomeIcon /> },
    { id: "requests", label: "Solicitudes", icon: <ListIcon /> },
    { id: "clients", label: "Clientes", icon: <PawLineIcon /> },
    { id: "routes", label: "Rutas", icon: <CompassIcon /> },
    { id: "profile", label: "Perfil", icon: <PersonIcon /> },
  ],
};

export type HomeShellProps = {
  role: HomeRole;
  /** Real screens by nav id; an id without a screen shows the home panel. */
  screens?: Partial<Record<string, ReactNode | ((go: (id: string) => void) => ReactNode)>>;
  onLogout?: () => void;
  /** The signed-in user's id; the home panel reads `/owners/{id}/home` with it. */
  userId?: string;
  /** Dev-only previews show fixtures instead of calling the API. */
  preview?: boolean;
  /** The API said 403: the session belongs to someone else, so sign out. */
  onForbidden?: () => void;
};

/**
 * The app after logging in: a glass navigation (left rail on wide screens,
 * bottom bar on phones) around either the home panel (animated city, sample
 * data for now) or one of the real screens passed in `screens`.
 */
/**
 * The green "active" pill. A lime copy of the bar sits over it and is
 * clipped to the active tab; changing tabs animates the clip, so the pill
 * slides and the label turns dark in one motion.
 */
function useActivePill(active: string) {
  const navRef = useRef<HTMLElement>(null);
  const [clip, setClip] = useState<string | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (nav === null) {
      return;
    }
    const measure = () => {
      const button = nav.querySelector<HTMLElement>(`[data-nav-id="${active}"]`);
      if (button === null) {
        setClip(null);
        return;
      }
      const top = button.offsetTop;
      const left = button.offsetLeft;
      const right = nav.clientWidth - left - button.offsetWidth;
      const bottom = nav.clientHeight - top - button.offsetHeight;
      setClip(`inset(${top}px ${right}px ${bottom}px ${left}px round 20px)`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [active]);

  return { navRef, clip };
}

export function HomeShell({ role, screens = {}, onLogout, userId = "", preview = false, onForbidden }: HomeShellProps) {
  const [active, setActive] = useState("home");
  const sceneRef = useRef<HTMLDivElement>(null);
  const { navRef, clip } = useActivePill(active);
  const items = NAV[role];

  const go = useCallback((id: string) => {
    setActive((current) => {
      if (current !== id) {
        // A new tab starts at its top, like a native tab bar.
        sceneRef.current?.scrollTo({ top: 0 });
      }
      return id;
    });
  }, []);

  const entry = screens[active];
  const screen = typeof entry === "function" ? entry(go) : entry;

  const shell = (
    <div className="auth-scene home" ref={sceneRef}>
      <div className="auth-backdrop" aria-hidden="true">
        <div className="auth-backdrop__clouds auth-backdrop__clouds--left" />
        <div className="auth-backdrop__clouds auth-backdrop__clouds--right" />
      </div>

      <nav className="glass home__nav" aria-label="Principal" ref={navRef}>
        <span className="home__logo" aria-hidden="true"><PawLineIcon /></span>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="home__nav-item"
            data-nav-id={item.id}
            aria-current={active === item.id ? "page" : undefined}
            onClick={() => go(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
        <div
          className="home__nav-pill"
          aria-hidden="true"
          style={clip === null ? { visibility: "hidden" } : { clipPath: clip }}
        >
          <span className="home__logo"><PawLineIcon /></span>
          {items.map((item) => (
            <span key={item.id} className="home__nav-item">
              {item.icon}
              <span>{item.label}</span>
            </span>
          ))}
        </div>
      </nav>

      {onLogout !== undefined ? (
        <button type="button" className="glass home__logout" onClick={onLogout}>
          Salir
        </button>
      ) : null}

      {/* Keyed by tab: each switch mounts a fresh view that fades in. */}
      <div key={active} className="home__view">
        {screen !== undefined ? (
          <main className="home__grid home__grid--screen">
            <div className="home__screen">{screen}</div>
          </main>
        ) : role === "owner" ? (
          <OwnerHome
            userId={userId}
            preview={preview}
            onNavigate={go}
            onForbidden={onForbidden}
          />
        ) : (
          <WalkerHome userId={userId} preview={preview} onNavigate={go} />
        )}
      </div>
    </div>
  );

  // One online switch and heartbeat for every walker tab, not only Inicio.
  return role === "walker" ? (
    <WalkerPresenceProvider walkerId={userId} preview={preview}>
      {shell}
    </WalkerPresenceProvider>
  ) : (
    shell
  );
}

/** Preview of the home panel on its own (`?preview=home-owner|home-walker`). */
export function HomeDashboard({ role }: { role: HomeRole }) {
  return <HomeShell role={role} preview userId={`preview-${role}`} />;
}
