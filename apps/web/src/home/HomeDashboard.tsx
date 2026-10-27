import { useState, type ReactNode } from "react";
import { CityScene } from "../city/CityScene.js";
import { ClockIcon, WalletIcon } from "../auth/icons.js";
import {
  CheckIcon,
  CloseIcon,
  CompassIcon,
  HomeIcon,
  ListIcon,
  PawLineIcon,
  PersonIcon,
} from "./icons.js";
import { WALKER_REQUESTS, formatCop, type HomeRole } from "./sampleData.js";
import { OwnerHome } from "./OwnerHome.js";
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

function WalkerGreeting() {
  return (
    <header className="home__greeting">
      <h1 className="home__title">Hola, paseador</h1>
      <p className="home__subtitle">Estas son tus solicitudes de hoy.</p>
    </header>
  );
}

function WalkerTicket() {
  return (
    <section className="glass home__ticket" aria-label="Próximo recorrido">
      <div className="home__ticket-main">
        <p className="home__ticket-label">Próximo recorrido</p>
        <p className="home__ticket-title">3 paradas</p>
        <p className="home__ticket-sub">Hoy, 5:00 pm · Centro y Torobajo</p>
        <ul className="home__chips">
          <li><ClockIcon />2 h 10 min</li>
          <li><WalletIcon />{formatCop(45000)}</li>
        </ul>
      </div>
      <img className="home__ticket-art" src="/art/characters/walker-thumbs.webp" alt="" draggable={false} />
    </section>
  );
}

type Decision = "accepted" | "declined";

function WalkerRequests() {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  return (
    <section className="glass home__list" aria-label="Solicitudes">
      <h2 className="home__card-title">Solicitudes</h2>
      <ul>
        {WALKER_REQUESTS.map((request) => {
          const decision = decisions[request.id];
          return (
            <li key={request.id} className="home__row home__row--request" data-decision={decision ?? "pending"}>
              <span className="home__chip-icon"><PawLineIcon /></span>
              <span className="home__row-text">
                <strong>{request.dog} · {formatCop(request.offerCop)}</strong>
                <span>{request.owner} · {request.zone} · {request.when}</span>
              </span>
              {decision === undefined ? (
                <span className="home__row-actions">
                  <button
                    type="button"
                    className="home__round home__round--ok"
                    aria-label={`Aceptar a ${request.dog}`}
                    onClick={() => setDecisions((current) => ({ ...current, [request.id]: "accepted" }))}
                  >
                    <CheckIcon />
                  </button>
                  <button
                    type="button"
                    className="home__round home__round--no"
                    aria-label={`Rechazar a ${request.dog}`}
                    onClick={() => setDecisions((current) => ({ ...current, [request.id]: "declined" }))}
                  >
                    <CloseIcon />
                  </button>
                </span>
              ) : (
                <span className="home__row-when">{decision === "accepted" ? "Aceptada" : "Rechazada"}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

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

  return (
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
        <main className="home__grid">
          <WalkerGreeting />
          <WalkerTicket />
          <div className="home__city">
            <CityScene />
          </div>
          <WalkerRequests />
        </main>
      )}
    </div>
  );
}

/** Preview of the home panel on its own (`?preview=home-owner|home-walker`). */
export function HomeDashboard({ role }: { role: HomeRole }) {
  return <HomeShell role={role} preview userId={`preview-${role}`} />;
}
