import { useEffect } from "react";
import { ClockIcon, PinIcon, ShieldIcon } from "../auth/icons.js";
import { CityScene } from "../city/CityScene.js";
import { translateApiError } from "../lib/errors.js";
import { formatCop, formatHourBogota, formatWhenBogota } from "../lib/format.js";
import { readHomePoint } from "../lib/homePoint.js";
import {
  fetchOwnerHome,
  fetchWeather,
  type HomePanel,
  type HomeWalk,
  type Weather,
  type WeatherCondition,
} from "../lib/marketplace.js";
import { statusOf, useFetched } from "../lib/useFetched.js";
import { DogLoader } from "../ui/DogLoader.js";
import { CloudIcon, MoonIcon, PawLineIcon, SunIcon } from "./icons.js";
import { PREVIEW_OWNER_HOME, PREVIEW_WEATHER } from "./previewData.js";

const CONDITION_ES: Record<WeatherCondition, string> = {
  clear: "Despejado",
  cloudy: "Nublado",
  fog: "Niebla",
  drizzle: "Llovizna",
  rain: "Lluvia",
  snow: "Nieve",
  storm: "Tormenta",
};

const ACTIVE_POLL_MS = 20_000;
/** The API caches weather for 15 minutes: refetch on focus no more often than that. */
const WEATHER_REFETCH_MS = 15 * 60_000;

function bogotaHourOf(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", hour12: false }).format(
      new Date(iso),
    ),
  );
}

function ConditionIcon({ condition, at }: { condition: WeatherCondition; at: string }) {
  if (condition === "clear") {
    return bogotaHourOf(at) >= 18 || bogotaHourOf(at) < 5 ? <MoonIcon /> : <SunIcon />;
  }
  return <CloudIcon />;
}

function minutesLabel(hours: number): string {
  return `${Math.round(hours * 60)} min`;
}

function CardLoader({ label }: { label: string }) {
  return (
    <div className="home__card-loader">
      <DogLoader label={label} />
    </div>
  );
}

export function WeatherCard({ preview }: { preview: boolean }) {
  const point = readHomePoint();
  const weather = useFetched<Weather>(
    () => (preview ? Promise.resolve(PREVIEW_WEATHER) : fetchWeather(point.lat, point.lng)),
    [preview, point.lat, point.lng],
  );

  // Refetch when the tab comes back, but never inside the API's 15-minute cache.
  const { reload } = weather;
  useEffect(() => {
    if (preview) {
      return;
    }
    let last = Date.now();
    function onVisible() {
      if (document.visibilityState === "visible" && Date.now() - last >= WEATHER_REFETCH_MS) {
        last = Date.now();
        reload();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [preview, reload]);

  if (weather.isLoading) {
    return (
      <section className="glass home__weather" aria-label="Clima">
        <CardLoader label="Cargando el clima…" />
      </section>
    );
  }
  // 503: the weather service is down. Hide the card instead of showing an error banner.
  if (weather.data === null) {
    return null;
  }

  const { data } = weather;
  return (
    <section className="glass home__weather" aria-label="Clima">
      <div className="home__weather-now">
        <span className="home__weather-icon">
          <ConditionIcon condition={data.condition} at={new Date().toISOString()} />
        </span>
        <div>
          <p className="home__weather-temp">{Math.round(data.temperatureC)}°</p>
          <p className="home__weather-city">{CONDITION_ES[data.condition]}</p>
        </div>
      </div>
      <ul className="home__weather-hours">
        {data.hours.slice(0, 5).map((hour) => (
          <li key={hour.at}>
            <span>{formatHourBogota(hour.at)}</span>
            <ConditionIcon condition={hour.condition} at={hour.at} />
            <strong>{Math.round(hour.temperatureC)}°</strong>
          </li>
        ))}
      </ul>
      {data.bestWindow !== null ? (
        <p className="home__note">
          Mejor hora para pasear: {formatHourBogota(data.bestWindow.start)}–{formatHourBogota(data.bestWindow.end)}{" "}
          (seco y templado)
        </p>
      ) : (
        <p className="home__note">Hoy no hay una ventana seca; revisa el pronóstico</p>
      )}
      {data.stale ? <p className="home__note">Actualizado hace un rato</p> : null}
    </section>
  );
}

function Ticket({ walk }: { walk: HomeWalk }) {
  return (
    <section className="glass home__ticket" aria-label="Próximo paseo">
      <div className="home__ticket-main">
        <p className="home__ticket-label">Próximo paseo</p>
        <p className="home__ticket-title">{walk.dogName ?? "Tu perro"}</p>
        <p className="home__ticket-sub">
          {formatWhenBogota(walk.requestedTime)} · con {walk.walkerName ?? "Paseador asignado"}
        </p>
        <ul className="home__chips">
          <li><ClockIcon />{minutesLabel(walk.durationHours)}</li>
          <li><PinIcon />{formatCop(walk.priceCop)}</li>
          <li><ShieldIcon />Verificado</li>
        </ul>
      </div>
      <img className="home__ticket-art" src="/art/characters/dog-sit.webp" alt="" draggable={false} />
    </section>
  );
}

function ActiveWalkCard({
  walk,
  onOpen,
}: {
  walk: NonNullable<HomePanel["activeWalk"]>;
  onOpen: () => void;
}) {
  return (
    <section className="glass home__ticket" aria-label="Paseo en curso">
      <div className="home__ticket-main">
        <p className="home__ticket-label">En vivo</p>
        <p className="home__ticket-title">
          {walk.dogName ?? "Tu perro"} está paseando con {walk.walkerName ?? "Paseador asignado"}
        </p>
        <p className="home__ticket-sub">{walk.minutesElapsed} min</p>
        <button type="button" className="home__cta" onClick={onOpen}>
          Ver en vivo
        </button>
      </div>
      <img className="home__ticket-art" src="/art/characters/dog-sit.webp" alt="" draggable={false} />
    </section>
  );
}

export type OwnerHomeProps = {
  userId: string;
  /** Dev-only `?preview=`: show fixtures instead of calling the API. */
  preview?: boolean;
  onNavigate: (screen: "explore" | "walks") => void;
  /** The API answered 403: this session belongs to someone else. */
  onForbidden?: () => void;
};

/** Owner Inicio: one `/home` call plus the weather card, nothing else. */
export function OwnerHome({ userId, preview = false, onNavigate, onForbidden }: OwnerHomeProps) {
  const home = useFetched<HomePanel>(
    () => (preview ? Promise.resolve(PREVIEW_OWNER_HOME) : fetchOwnerHome(userId)),
    [userId, preview],
    {
      pollMs: ACTIVE_POLL_MS,
      shouldPoll: (data) => data?.activeWalk !== null && data?.activeWalk !== undefined,
    },
  );

  const forbidden = statusOf(home.error) === 403;
  useEffect(() => {
    if (forbidden) {
      onForbidden?.();
    }
  }, [forbidden, onForbidden]);

  const { data } = home;

  return (
    <main className="home__grid">
      <header className="home__greeting">
        <h1 className="home__title">Hola, {data?.greetingName ?? "dueño"}</h1>
        <p className="home__subtitle">¿Listo para el próximo paseo de tu peludo?</p>
      </header>

      {home.isStale ? (
        <p className="home__note" role="status">Sin conexión</p>
      ) : null}

      {home.isLoading ? (
        <section className="glass home__ticket" aria-label="Próximo paseo">
          <CardLoader label="Cargando tu panel…" />
        </section>
      ) : null}

      {!home.isLoading && data === null ? (
        <section className="glass home__list" role="alert">
          <p>{translateApiError(home.error, "No pudimos cargar tu panel.")}</p>
          <button type="button" className="home__cta" onClick={home.reload}>
            Reintentar
          </button>
        </section>
      ) : null}

      {data !== null && data.activeWalk !== null ? (
        <ActiveWalkCard walk={data.activeWalk} onOpen={() => onNavigate("walks")} />
      ) : null}
      {data !== null && data.activeWalk === null && data.nextWalk !== null ? (
        <Ticket walk={data.nextWalk} />
      ) : null}
      {data !== null && data.activeWalk === null && data.nextWalk === null ? (
        <section className="glass home__ticket" aria-label="Sin paseos">
          <div className="home__ticket-main">
            <p className="home__ticket-label">Próximo paseo</p>
            <p className="home__ticket-sub">Aún no tienes paseos programados.</p>
            <button type="button" className="home__cta" onClick={() => onNavigate("explore")}>
              Pedir un paseo
            </button>
          </div>
        </section>
      ) : null}

      <WeatherCard preview={preview} />

      <div className="home__city">
        <CityScene />
      </div>

      {data !== null ? (
        <>
          <section className="glass home__list" aria-label="Estadísticas">
            <ul className="home__chips">
              <li><PawLineIcon />{data.counts.dogs} {data.counts.dogs === 1 ? "perro" : "perros"}</li>
              <li><ClockIcon />{data.counts.walksDone} paseos hechos</li>
              <li><PinIcon />{data.counts.openRequests} solicitudes abiertas</li>
            </ul>
          </section>

          <section className="glass home__list" aria-label="Paseos programados">
            <h2 className="home__card-title">Paseos programados</h2>
            {data.upcoming.length === 0 ? (
              <p className="home__note">No tienes paseos programados.</p>
            ) : (
              <ul>
                {data.upcoming.map((walk) => (
                  <li key={walk.id} className="home__row">
                    <span className="home__chip-icon"><PawLineIcon /></span>
                    <span className="home__row-text">
                      <strong>Paseo de {walk.dogName ?? "tu perro"}</strong>
                      <span>
                        {walk.walkerName ?? "Paseador asignado"} · {minutesLabel(walk.durationHours)}
                      </span>
                    </span>
                    <span className="home__row-when">{formatWhenBogota(walk.requestedTime)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.openRequests.length > 0 ? (
            <section className="glass home__list" aria-label="Solicitudes abiertas">
              <h2 className="home__card-title">Solicitudes abiertas</h2>
              <ul>
                {data.openRequests.map((request) => (
                  <li key={request.id} className="home__row">
                    <span className="home__chip-icon"><PawLineIcon /></span>
                    <span className="home__row-text">
                      <strong>{request.dogName ?? "Tu perro"} · {formatCop(request.priceCop)}</strong>
                      <span>{formatWhenBogota(request.requestedTime)}</span>
                    </span>
                    <button
                      type="button"
                      className="home__segment"
                      aria-label={`Ver ofertas de ${request.dogName ?? "tu perro"}`}
                      onClick={() => onNavigate("explore")}
                    >
                      {request.offerCount} {request.offerCount === 1 ? "oferta" : "ofertas"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
