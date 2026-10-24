import { useState, type ReactNode } from "react";
import { CityScene } from "../city/CityScene.js";
import { ClockIcon, PinIcon, ShieldIcon, WalletIcon } from "../auth/icons.js";
import {
  CheckIcon,
  CloseIcon,
  CloudIcon,
  CompassIcon,
  HomeIcon,
  ListIcon,
  MinusIcon,
  MoonIcon,
  PawLineIcon,
  PersonIcon,
  PlusIcon,
  SunIcon,
} from "./icons.js";
import {
  OWNER_WALKS,
  PRICE_MAX_COP,
  PRICE_MIN_COP,
  PRICE_STEP_COP,
  WALKER_REQUESTS,
  WALK_DURATIONS,
  WEATHER_SAMPLE,
  formatCop,
  suggestedFare,
  type HomeRole,
} from "./sampleData.js";
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

const WEATHER_ICONS = { sun: <SunIcon />, cloud: <CloudIcon />, moon: <MoonIcon /> } as const;

function Greeting({ role }: { role: HomeRole }) {
  return (
    <header className="home__greeting">
      <h1 className="home__title">{role === "owner" ? "Hola, dueño" : "Hola, cuidador"}</h1>
      <p className="home__subtitle">
        {role === "owner" ? "¿Listo para el próximo paseo de tu peludo?" : "Estas son tus solicitudes de hoy."}
      </p>
    </header>
  );
}

function Weather() {
  return (
    <section className="glass home__weather" aria-label={`Clima en ${WEATHER_SAMPLE.city}`}>
      <div className="home__weather-now">
        <span className="home__weather-icon"><SunIcon /></span>
        <div>
          <p className="home__weather-temp">{WEATHER_SAMPLE.temperature}°</p>
          <p className="home__weather-city">{WEATHER_SAMPLE.city} · {WEATHER_SAMPLE.summary}</p>
        </div>
      </div>
      <ul className="home__weather-hours">
        {WEATHER_SAMPLE.hours.map((hour) => (
          <li key={hour.label}>
            <span>{hour.label}</span>
            {WEATHER_ICONS[hour.icon]}
            <strong>{hour.temperature}°</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Owner: the fare is offered by the owner, inDrive style, and the walker accepts or not. */
function RequestPanel() {
  const [minutes, setMinutes] = useState<number>(WALK_DURATIONS[1]);
  const [fare, setFare] = useState(suggestedFare(WALK_DURATIONS[1]));
  const [sentFare, setSentFare] = useState<number | null>(null);

  function pickDuration(next: number) {
    setMinutes(next);
    setFare(suggestedFare(next));
    setSentFare(null);
  }

  function changeFare(delta: number) {
    setFare((current) => Math.min(PRICE_MAX_COP, Math.max(PRICE_MIN_COP, current + delta)));
    setSentFare(null);
  }

  return (
    <section className="glass home__request" aria-label="Pedir un paseo">
      <h2 className="home__card-title">Pedir un paseo</h2>
      <div className="home__segments" role="radiogroup" aria-label="Duración del paseo">
        {WALK_DURATIONS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={minutes === option}
            className="home__segment"
            onClick={() => pickDuration(option)}
          >
            {option} min
          </button>
        ))}
      </div>
      <div className="home__fare">
        <button
          type="button"
          className="home__round"
          aria-label="Bajar tarifa"
          disabled={fare <= PRICE_MIN_COP}
          onClick={() => changeFare(-PRICE_STEP_COP)}
        >
          <MinusIcon />
        </button>
        <p className="home__fare-value" aria-live="polite">
          <span className="home__fare-caption">Tu oferta</span>
          {formatCop(fare)}
        </p>
        <button
          type="button"
          className="home__round"
          aria-label="Subir tarifa"
          disabled={fare >= PRICE_MAX_COP}
          onClick={() => changeFare(PRICE_STEP_COP)}
        >
          <PlusIcon />
        </button>
      </div>
      <button type="button" className="home__cta" onClick={() => setSentFare(fare)}>
        Buscar cuidador
      </button>
      {sentFare !== null ? (
        <p className="home__note" role="status">
          Oferta de {formatCop(sentFare)} por {minutes} min lista para enviar. (Vista previa: aún no hay cuidadores conectados.)
        </p>
      ) : null}
    </section>
  );
}

function OwnerTicket() {
  return (
    <section className="glass home__ticket" aria-label="Próximo paseo">
      <div className="home__ticket-main">
        <p className="home__ticket-label">Próximo paseo</p>
        <p className="home__ticket-title">Luna</p>
        <p className="home__ticket-sub">Hoy, 5:00 pm · con Mateo</p>
        <ul className="home__chips">
          <li><ClockIcon />45 min</li>
          <li><PinIcon />Parque Infantil</li>
          <li><ShieldIcon />Verificado</li>
        </ul>
      </div>
      <img className="home__ticket-art" src="/art/characters/dog-sit.webp" alt="" draggable={false} />
    </section>
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

function OwnerWalks() {
  return (
    <section className="glass home__list" aria-label="Paseos programados">
      <h2 className="home__card-title">Paseos programados</h2>
      <ul>
        {OWNER_WALKS.map((walk) => (
          <li key={walk.id} className="home__row">
            <span className="home__chip-icon"><PawLineIcon /></span>
            <span className="home__row-text">
              <strong>{walk.title}</strong>
              <span>{walk.detail}</span>
            </span>
            <span className="home__row-when">{walk.when}</span>
          </li>
        ))}
      </ul>
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
  screens?: Partial<Record<string, ReactNode>>;
  onLogout?: () => void;
};

/**
 * The app after logging in: a glass navigation (left rail on wide screens,
 * bottom bar on phones) around either the home panel (animated city, sample
 * data for now) or one of the real screens passed in `screens`.
 */
export function HomeShell({ role, screens = {}, onLogout }: HomeShellProps) {
  const [active, setActive] = useState("home");
  const items = NAV[role];
  const screen = screens[active];

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
      ) : (
        <main className="home__grid">
          <Greeting role={role} />
          {role === "owner" ? <OwnerTicket /> : <WalkerTicket />}
          <Weather />
          <div className="home__city">
            <CityScene />
          </div>
          {role === "owner" ? <RequestPanel /> : null}
          {role === "owner" ? <OwnerWalks /> : <WalkerRequests />}
        </main>
      )}
    </div>
  );
}

/** Preview of the home panel on its own (`?preview=home-owner|home-walker`). */
export function HomeDashboard({ role }: { role: HomeRole }) {
  return <HomeShell role={role} />;
}
