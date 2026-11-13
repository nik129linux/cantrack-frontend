import { useState, type ReactNode } from "react";
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
export function HomeShell({ role, screens = {}, onLogout, userId = "", preview = false, onForbidden }: HomeShellProps) {
  const [active, setActive] = useState("home");
  const items = NAV[role];
  const entry = screens[active];
  const screen = typeof entry === "function" ? entry(setActive) : entry;

  const shell = (
    <div className="auth-scene home">
      <div className="auth-backdrop" aria-hidden="true">
        <div className="auth-backdrop__clouds auth-backdrop__clouds--left" />
        <div className="auth-backdrop__clouds auth-backdrop__clouds--right" />
      </div>

      <nav className="glass home__nav" aria-label="Principal">
        <span className="home__logo" aria-hidden="true"><PawLineIcon /></span>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="home__nav-item"
            aria-current={active === item.id ? "page" : undefined}
            onClick={() => setActive(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {onLogout !== undefined ? (
        <button type="button" className="glass home__logout" onClick={onLogout}>
          Salir
        </button>
      ) : null}

      {screen !== undefined ? (
        <main className="home__grid home__grid--screen">
          <div className="home__screen">{screen}</div>
        </main>
      ) : role === "owner" ? (
        <OwnerHome
          userId={userId}
          preview={preview}
          onNavigate={setActive}
          onForbidden={onForbidden}
        />
      ) : (
        <WalkerHome userId={userId} preview={preview} onNavigate={setActive} />
      )}
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
