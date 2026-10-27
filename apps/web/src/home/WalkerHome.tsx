import { useCallback, useEffect, useRef, useState } from "react";
import { ClockIcon, WalletIcon } from "../auth/icons.js";
import { CityScene } from "../city/CityScene.js";
import { ApiError } from "../lib/apiError.js";
import { translateApiError } from "../lib/errors.js";
import { formatCop, formatHourBogota, formatWhenBogota } from "../lib/format.js";
import {
  fetchEarnings,
  fetchWalkerHome,
  sendHeartbeat,
  setAvailability,
  type Earnings,
  type EarningsPeriod,
  type WalkerHome as WalkerHomeData,
  type WalkerHomeWalk,
} from "../lib/marketplace.js";
import { statusOf, useFetched } from "../lib/useFetched.js";
import { DogLoader } from "../ui/DogLoader.js";
import { PawLineIcon } from "./icons.js";
import { PREVIEW_WALKER_HOME } from "./previewData.js";

const ACTIVE_POLL_MS = 20_000;
/** Online means the app sent its position in the last 120 s: beat every 30 s. */
export const HEARTBEAT_MS = 30_000;
const SWITCH_COOLDOWN_MS = 10_000;

const PERIODS: { id: EarningsPeriod; label: string }[] = [
  { id: "day", label: "Día" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];

function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || navigator.geolocation === undefined) {
      reject(new Error("no geolocation"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15_000 },
    );
  });
}

function EarningsCard({ walkerId, preview }: { walkerId: string; preview: boolean }) {
  const [period, setPeriod] = useState<EarningsPeriod>("week");
  const earnings = useFetched<Earnings>(
    () =>
      preview
        ? Promise.resolve({
            period, from: "2026-10-19", to: "2026-10-25", simulated: true as const, commissionPct: 10,
            walks: 6, grossCop: 102000, commissionCop: 10200, netCop: 91800,
            byDay: [15000, 0, 22000, 18000, 0, 30000, 17000].map((gross, index) => ({
              date: `2026-10-${19 + index}`, walks: gross > 0 ? 1 : 0, grossCop: gross, netCop: gross * 0.9,
            })),
          })
        : fetchEarnings(walkerId, period),
    [walkerId, period, preview],
  );
  const data = earnings.data;
  const max = data === null ? 1 : Math.max(1, ...data.byDay.map((day) => day.netCop));

  return (
    <section className="glass home__list" aria-label="Ganancias">
      <h2 className="home__card-title">Ganancias</h2>
      <div className="home__segments" role="group" aria-label="Periodo">
        {PERIODS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="home__segment"
            aria-pressed={period === option.id}
            onClick={() => setPeriod(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {earnings.isLoading ? <DogLoader label="Cargando ganancias…" /> : null}
      {earnings.error !== null && data === null ? (
        <p role="alert">{translateApiError(earnings.error, "No pudimos cargar tus ganancias.")}</p>
      ) : null}
      {data !== null ? (
        <>
          <p className="home__note">
            {data.walks} {data.walks === 1 ? "paseo" : "paseos"} · {formatCop(data.netCop)} netos
          </p>
          <p className="home__note">
            Comisión simulada {data.commissionPct}%: {formatCop(data.commissionCop)}
          </p>
          <ol className="home__bars" aria-label="Ganancias por día">
            {data.byDay.map((day) => (
              <li key={day.date} title={`${day.date}: ${formatCop(day.netCop)}`}>
                <span className="home__bar" style={{ height: `${Math.round((day.netCop / max) * 100)}%` }} />
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}

function WalkTicket({ walk, label, live }: { walk: WalkerHomeWalk; label: string; live: boolean }) {
  return (
    <section className="glass home__ticket" aria-label={label}>
      <div className="home__ticket-main">
        <p className="home__ticket-label">{label}</p>
        <p className="home__ticket-title">{live ? `Paseando a ${walk.dogName ?? "un perro"}` : (walk.dogName ?? "Un perro")}</p>
        <p className="home__ticket-sub">
          {live ? `desde ${formatHourBogota(walk.requestedTime)}` : formatWhenBogota(walk.requestedTime)} ·{" "}
          {walk.ownerName ?? "Dueño"}
        </p>
        <ul className="home__chips">
          <li><ClockIcon />{Math.round(walk.durationHours * 60)} min</li>
          <li><WalletIcon />{formatCop(walk.priceCop)}</li>
        </ul>
      </div>
      <img className="home__ticket-art" src="/art/characters/walker-thumbs.webp" alt="" draggable={false} />
    </section>
  );
}

export type WalkerHomeProps = {
  userId: string;
  preview?: boolean;
  onNavigate: (screen: "requests") => void;
};

/** Walker Inicio: the online switch, one `/home` call and Ganancias. */
export function WalkerHome({ userId, preview = false, onNavigate }: WalkerHomeProps) {
  const home = useFetched<WalkerHomeData>(
    () => (preview ? Promise.resolve(PREVIEW_WALKER_HOME) : fetchWalkerHome(userId)),
    [userId, preview],
    { pollMs: ACTIVE_POLL_MS, shouldPoll: (data) => data?.activeWalk !== null && data?.activeWalk !== undefined },
  );
  const [online, setOnline] = useState<boolean | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const data = home.data;
  const isOnline = online ?? data?.online ?? false;
  const onlineRef = useRef(isOnline);
  onlineRef.current = isOnline;

  // The server is the truth for `online`: adopt it whenever /home answers.
  useEffect(() => {
    if (data !== null) {
      setOnline(data.online);
    }
  }, [data]);

  // Heartbeat while the switch is on; nothing is sent once it is off.
  useEffect(() => {
    if (!isOnline || preview) {
      return;
    }
    const id = window.setInterval(() => {
      void currentPosition()
        .then((point) => sendHeartbeat(point.lat, point.lng))
        .catch(() => undefined);
    }, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [isOnline, preview]);

  // After a sleep of more than 2 minutes the server may have flipped us offline: read it again.
  const { reload } = home;
  useEffect(() => {
    if (preview) {
      return;
    }
    function onVisible() {
      if (document.visibilityState === "visible") {
        reload();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [preview, reload]);

  const toggle = useCallback(async () => {
    setSwitchError(null);
    const next = !onlineRef.current;
    try {
      if (preview) {
        setOnline(next);
        return;
      }
      if (next) {
        const point = await currentPosition().catch(() => null);
        if (point === null) {
          setSwitchError("Activa la ubicación del navegador para conectarte.");
          return;
        }
        await setAvailability(userId, true, point);
      } else {
        await setAvailability(userId, false);
      }
      setOnline(next);
      reload();
    } catch (failure: unknown) {
      if (failure instanceof ApiError && failure.status === 429) {
        setSwitchError("Espera un momento");
        setCooldown(true);
        window.setTimeout(() => setCooldown(false), SWITCH_COOLDOWN_MS);
      } else {
        setSwitchError(translateApiError(failure, "No pudimos cambiar tu estado."));
      }
    }
  }, [preview, reload, userId]);

  const unauthorized = statusOf(home.error) === 401;

  return (
    <main className="home__grid" data-offline={!isOnline ? "" : undefined}>
      <header className="home__greeting">
        <h1 className="home__title">Hola, {data?.greetingName ?? "paseador"}</h1>
        <p className="home__subtitle">
          {isOnline ? "Estás recibiendo solicitudes." : "Conéctate para recibir solicitudes"}
        </p>
      </header>

      <section className="glass home__list" aria-label="Estado">
        <button
          type="button"
          role="switch"
          aria-checked={isOnline}
          className="home__cta"
          disabled={home.isLoading || cooldown}
          onClick={() => void toggle()}
        >
          {isOnline ? "Conectado" : "Desconectado"}
        </button>
        {switchError !== null ? <p className="home__note" role="alert">{switchError}</p> : null}
      </section>

      {home.isStale ? <p className="home__note" role="status">Sin conexión</p> : null}
      {unauthorized ? <p className="home__note" role="alert">Tu sesión venció. Vuelve a ingresar.</p> : null}

      {home.isLoading ? (
        <section className="glass home__ticket" aria-label="Cargando">
          <div className="home__card-loader"><DogLoader label="Cargando tu panel…" /></div>
        </section>
      ) : null}

      {!home.isLoading && data === null && !unauthorized ? (
        <section className="glass home__list" role="alert">
          <p>{translateApiError(home.error, "No pudimos cargar tu panel.")}</p>
          <button type="button" className="home__cta" onClick={home.reload}>Reintentar</button>
        </section>
      ) : null}

      {data !== null && data.activeWalk !== null ? (
        <WalkTicket walk={data.activeWalk} label="Paseo en curso" live />
      ) : null}
      {data !== null && data.activeWalk === null && data.nextWalk !== null ? (
        <WalkTicket walk={data.nextWalk} label="Próximo recorrido" live={false} />
      ) : null}

      {data !== null ? (
        <section className="glass home__list" aria-label="Resumen de hoy">
          {data.today.walks === 0 ? (
            <p className="home__note">Aún no hay paseos hoy</p>
          ) : (
            <>
              <p className="home__card-title">
                Hoy: {data.today.walks} {data.today.walks === 1 ? "paseo" : "paseos"} · {formatCop(data.today.netCop)} netos
              </p>
              <p className="home__note">Comisión simulada 10%: {formatCop(data.today.commissionCop)}</p>
            </>
          )}
          <p className="home__note">
            {data.rating.average === null
              ? "Sin calificaciones aún"
              : `★ ${data.rating.average.toFixed(1)} (${data.rating.count})`}
          </p>
          {isOnline && data.openNearby > 0 ? (
            <button type="button" className="home__segment" onClick={() => onNavigate("requests")}>
              {data.openNearby} {data.openNearby === 1 ? "solicitud cerca" : "solicitudes cerca"}
            </button>
          ) : null}
          {!isOnline ? <p className="home__note">Conéctate para recibir solicitudes</p> : null}
        </section>
      ) : null}

      <div className="home__city">
        <CityScene />
      </div>

      <EarningsCard walkerId={userId} preview={preview} />

      {data !== null && data.pendingOffers > 0 ? (
        <section className="glass home__list" aria-label="Ofertas pendientes">
          <p className="home__note">
            <PawLineIcon /> {data.pendingOffers} {data.pendingOffers === 1 ? "oferta espera" : "ofertas esperan"} al dueño
          </p>
        </section>
      ) : null}
    </main>
  );
}
