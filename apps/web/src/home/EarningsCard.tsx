import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { translateApiError } from "../lib/errors.js";
import { bogotaDate, formatCop, formatHourBogota } from "../lib/format.js";
import {
  fetchEarnings,
  setWalkerGoal,
  type Earnings,
  type EarningsPeriod,
} from "../lib/marketplace.js";
import { useFetched } from "../lib/useFetched.js";
import { MascotSprite } from "../mascot/MascotSprite.js";
import { DogLoader } from "../ui/DogLoader.js";

const PERIODS: { id: EarningsPeriod; label: string }[] = [
  { id: "day", label: "Día" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];

const VS_LABEL: Record<EarningsPeriod, string> = {
  day: "vs. ayer",
  week: "vs. semana pasada",
  month: "vs. mes pasado",
};

const FIRST_LABEL: Record<EarningsPeriod, string> = {
  day: "Primer día con ganancias",
  week: "Primera semana con ganancias",
  month: "Primer mes con ganancias",
};

const GOAL_LABEL: Record<EarningsPeriod, string> = {
  day: "Meta del día",
  week: "Meta semanal",
  month: "Meta del mes",
};

const WEEKDAY_LETTER = ["D", "L", "M", "M", "J", "V", "S"];
const GOAL_MIN = 10_000;
const GOAL_MAX = 5_000_000;

const dayFormat = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

/** "jue, 12 nov" for a YYYY-MM-DD local date. */
function dayName(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : dayFormat.format(parsed).replace(/\./g, "");
}

function dayLetter(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return Number.isNaN(day) ? "" : (WEEKDAY_LETTER[day] ?? "");
}

function prefersReducedMotion(): boolean {
  return (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Counts from the last shown value up (or down) to `value` in ~600 ms. */
function useCountUp(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / 600);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(start + (value - start) * eased);
      setShown(next);
      from.current = next;
      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return shown;
}

/** The goal scaled to the period: a seventh a day, days/7 for a month. */
function goalFor(period: EarningsPeriod, weekly: number, days: number): number {
  if (period === "day") {
    return Math.round(weekly / 7);
  }
  if (period === "month") {
    return Math.round((weekly * days) / 7);
  }
  return weekly;
}

function CompareChip({ period, net, previous }: { period: EarningsPeriod; net: number; previous: number }) {
  if (net === 0 && previous === 0) {
    return null;
  }
  if (previous === 0) {
    return <span className="earn__compare" data-trend="up">{FIRST_LABEL[period]}</span>;
  }
  const pct = Math.round(((net - previous) / previous) * 100);
  if (pct === 0) {
    return <span className="earn__compare">= Igual {VS_LABEL[period]}</span>;
  }
  const up = pct > 0;
  return (
    <span className="earn__compare" data-trend={up ? "up" : "down"}>
      {up ? "▲" : "▼"} {Math.abs(pct)} % {VS_LABEL[period]}
    </span>
  );
}

function GoalRing({
  period,
  net,
  weeklyGoal,
  days,
  onSave,
}: {
  period: EarningsPeriod;
  net: number;
  weeklyGoal: number | null;
  days: number;
  onSave: (goal: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputId = useId();

  if (editing) {
    const submit = async () => {
      const value = Number(draft.replace(/\D/g, ""));
      if (!Number.isFinite(value) || value < GOAL_MIN || value > GOAL_MAX) {
        setError("Entre $10.000 y $5.000.000.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await onSave(value);
        setEditing(false);
      } catch (failure: unknown) {
        setError(translateApiError(failure, "No pudimos guardar tu meta."));
      } finally {
        setSaving(false);
      }
    };
    return (
      <form
        className="earn__goal-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor={inputId}>Meta semanal</label>
        <input
          id={inputId}
          inputMode="numeric"
          autoFocus
          value={draft}
          placeholder="100.000"
          onChange={(event) => setDraft(event.target.value)}
        />
        {error !== null ? <p className="earn__goal-error" role="alert">{error}</p> : null}
        <div className="earn__goal-actions">
          <button type="submit" className="whome__primary" disabled={saving}>Guardar</button>
          <button type="button" className="whome__ghost" onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      </form>
    );
  }

  const openEditor = () => {
    setDraft(weeklyGoal === null ? "" : String(weeklyGoal));
    setError(null);
    setEditing(true);
  };

  if (weeklyGoal === null) {
    return (
      <button type="button" className="earn__goal-empty" onClick={openEditor}>
        Fija tu meta semanal
      </button>
    );
  }

  const goal = Math.max(1, goalFor(period, weeklyGoal, days));
  const ratio = Math.min(1, net / goal);
  const pct = Math.round((net / goal) * 100);
  const done = net >= goal;
  const radius = 34;
  const length = 2 * Math.PI * radius;

  return (
    <div className="earn__goal" data-done={done ? "" : undefined}>
      <svg viewBox="0 0 84 84" className="earn__ring" role="img" aria-label={`${GOAL_LABEL[period]}: ${pct} %`}>
        <circle cx="42" cy="42" r={radius} className="earn__ring-track" />
        <circle
          cx="42"
          cy="42"
          r={radius}
          className="earn__ring-fill"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - ratio)}
          transform="rotate(-90 42 42)"
        />
        <text x="42" y="47" textAnchor="middle" className="earn__ring-text">{pct}%</text>
      </svg>
      <div className="earn__goal-text">
        <span className="earn__goal-label">{GOAL_LABEL[period]}</span>
        <strong>{done ? "¡Meta cumplida!" : `${formatCop(net)} de ${formatCop(goal)}`}</strong>
        <button type="button" className="earn__goal-edit" onClick={openEditor} aria-label="Cambiar meta">
          Cambiar
        </button>
      </div>
    </div>
  );
}

type Point = { date: string; walks: number; netCop: number };

function tipText(point: Point): string {
  return `${dayName(point.date)} · ${point.walks} ${point.walks === 1 ? "paseo" : "paseos"} · ${formatCop(point.netCop)} netos`;
}

/** Shared keyboard + pointer handling for the per-day hit targets. */
function useActiveDay(count: number) {
  const [active, setActive] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active === null) {
      return;
    }
    const close = (event: PointerEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) {
        setActive(null);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [active]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    const current = active ?? 0;
    const next = Math.max(0, Math.min(count - 1, current + (event.key === "ArrowRight" ? 1 : -1)));
    setActive(next);
    root.current?.querySelectorAll<HTMLButtonElement>("[data-day]")[next]?.focus();
  };

  return { active, setActive, root, onKeyDown };
}

function ChartTip({ point, index, count }: { point: Point; index: number; count: number }) {
  const left = ((index + 0.5) / count) * 100;
  return (
    <div className="earn__tip" role="status" style={{ left: `clamp(70px, ${left}%, calc(100% - 70px))` }}>
      <strong>{dayName(point.date)}</strong>
      <span>
        {point.walks} {point.walks === 1 ? "paseo" : "paseos"} · {formatCop(point.netCop)}
      </span>
    </div>
  );
}

function WeekBars({ days }: { days: Point[] }) {
  const { active, setActive, root, onKeyDown } = useActiveDay(days.length);
  const max = Math.max(1, ...days.map((day) => day.netCop));
  const worked = days.filter((day) => day.netCop > 0);
  const avg = worked.length === 0 ? 0 : Math.round(worked.reduce((sum, day) => sum + day.netCop, 0) / worked.length);
  const today = bogotaDate();

  return (
    <div className="earn__chart" ref={root} onKeyDown={onKeyDown}>
      {active !== null && days[active] !== undefined ? (
        <ChartTip point={days[active]} index={active} count={days.length} />
      ) : null}
      <div className="earn__bars" role="group" aria-label="Ganancias por día">
        {avg > 0 ? (
          <div className="earn__avg" style={{ bottom: `calc(21px + (100% - 21px) * ${(avg / max).toFixed(3)})` }} aria-hidden="true">
            <span>prom. {formatCop(avg)}</span>
          </div>
        ) : null}
        {days.map((day, index) => (
          <button
            key={day.date}
            type="button"
            data-day=""
            className="earn__bar-col"
            aria-label={tipText(day)}
            aria-pressed={active === index}
            data-today={day.date === today ? "" : undefined}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setActive(index);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") setActive(null);
            }}
            onFocus={() => setActive(index)}
            onClick={() => setActive(index)}
          >
            <span className="earn__bar-track">
              <span
                className="earn__bar"
                data-empty={day.netCop === 0 ? "" : undefined}
                style={{ height: `${Math.max(5, (day.netCop / max) * 100)}%`, ["--i" as string]: index }}
              />
            </span>
            <span className="earn__bar-day" aria-hidden="true">{dayLetter(day.date)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** A smooth path through the points (Catmull-Rom turned into cubic Béziers). */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) {
    return "";
  }
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

const AREA_W = 300;
const AREA_H = 110;

function MonthArea({ days, bestDate }: { days: Point[]; bestDate: string | null }) {
  const { active, setActive, root, onKeyDown } = useActiveDay(days.length);
  const gradientId = useId();
  const max = Math.max(1, ...days.map((day) => day.netCop));
  const step = days.length > 1 ? AREA_W / (days.length - 1) : AREA_W;
  const points = days.map((day, index) => ({
    x: index * step,
    y: AREA_H - 6 - (day.netCop / max) * (AREA_H - 16),
  }));
  const line = smoothPath(points);
  const area = `${line} L ${AREA_W} ${AREA_H} L 0 ${AREA_H} Z`;
  const bestIndex = bestDate === null ? -1 : days.findIndex((day) => day.date === bestDate);
  const marker = active ?? (bestIndex >= 0 ? bestIndex : null);

  return (
    <div className="earn__chart" ref={root} onKeyDown={onKeyDown}>
      {active !== null && days[active] !== undefined ? (
        <ChartTip point={days[active]} index={active} count={days.length} />
      ) : null}
      <div className="earn__area-wrap">
        <svg className="earn__area" viewBox={`0 0 ${AREA_W} ${AREA_H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#b9e35e" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#b9e35e" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} className="earn__area-fill" />
          <path d={line} className="earn__area-line" pathLength={1} vectorEffect="non-scaling-stroke" />
        </svg>
        {marker !== null && points[marker] !== undefined ? (
          <span
            className="earn__dot"
            data-best={marker === bestIndex ? "" : undefined}
            style={{ left: `${(points[marker].x / AREA_W) * 100}%`, top: `${(points[marker].y / AREA_H) * 100}%` }}
            aria-hidden="true"
          />
        ) : null}
        <div className="earn__hits" role="group" aria-label="Ganancias por día">
          {days.map((day, index) => (
            <button
              key={day.date}
              type="button"
              data-day=""
              className="earn__hit"
              aria-label={tipText(day)}
              aria-pressed={active === index}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setActive(index);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setActive(null);
              }}
              onFocus={() => setActive(index)}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
      </div>
      <div className="earn__axis" aria-hidden="true">
        <span>{days[0] !== undefined ? dayName(days[0].date) : ""}</span>
        <span>{days.length > 0 ? dayName(days[days.length - 1]!.date) : ""}</span>
      </div>
    </div>
  );
}

function DayList({ walks }: { walks: NonNullable<Earnings["dayWalks"]> }) {
  const max = Math.max(1, ...walks.map((walk) => walk.netCop));
  return (
    <ul className="earn__day-list" aria-label="Paseos de hoy">
      {walks.map((walk, index) => (
        <li key={walk.id} style={{ ["--i" as string]: index }}>
          <span className="earn__day-avatar" aria-hidden="true">{(walk.dogName ?? "?").charAt(0).toUpperCase()}</span>
          <span className="earn__day-main">
            <strong>{walk.dogName ?? "Un perro"}</strong>
            <span>{formatHourBogota(walk.requestedTime)}</span>
            <span className="earn__day-meter" aria-hidden="true">
              <span style={{ width: `${(walk.netCop / max) * 100}%` }} />
            </span>
          </span>
          <strong className="earn__day-net">{formatCop(walk.netCop)}</strong>
        </li>
      ))}
    </ul>
  );
}

function EmptyEarnings({ period, onRequests }: { period: EarningsPeriod; onRequests: () => void }) {
  return (
    <div className="earn__empty">
      <div className="earn__ghosts" aria-hidden="true">
        {[40, 65, 30, 80, 55, 70, 45].map((height, index) => (
          <span key={index} style={{ height: `${height}%`, ["--i" as string]: index }} />
        ))}
      </div>
      <div className="earn__empty-copy">
        <MascotSprite pose="walk" size={84} />
        <p>
          {period === "day"
            ? "Hoy aún no terminas paseos. Conéctate y oferta en una solicitud."
            : "Tu primera ganancia aparece aquí. Conéctate y oferta en una solicitud."}
        </p>
        <button type="button" className="whome__primary" onClick={onRequests}>Ver solicitudes</button>
      </div>
    </div>
  );
}

/** Ganancias: count-up total, comparison, weekly goal ring and an interactive chart per period. */
export function EarningsCard({
  walkerId,
  preview,
  onRequests,
}: {
  walkerId: string;
  preview: boolean;
  onRequests: () => void;
}) {
  const [period, setPeriod] = useState<EarningsPeriod>("week");
  const [goalOverride, setGoalOverride] = useState<number | null | undefined>(undefined);
  const earnings = useFetched<Earnings>(
    () => (preview ? Promise.resolve(previewEarnings(period)) : fetchEarnings(walkerId, period)),
    [walkerId, period, preview],
  );

  // Keep the last answer on screen while another period loads: no jump to a loader.
  const [shown, setShown] = useState<Earnings | null>(null);
  useEffect(() => {
    if (earnings.data !== null) {
      setShown(earnings.data);
    }
  }, [earnings.data]);

  const data = earnings.data ?? shown;
  const total = useCountUp(data?.netCop ?? 0);
  const weeklyGoal = goalOverride !== undefined ? goalOverride : (data?.goalCop ?? null);

  const saveGoal = async (goal: number) => {
    if (!preview) {
      await setWalkerGoal(walkerId, goal);
    }
    setGoalOverride(goal);
  };

  const days: Point[] = data?.byDay ?? [];
  const isEmpty = data !== null && data.netCop === 0;
  const best = data?.bestDay ?? null;

  return (
    <section className="glass whome__card whome__earnings earn" aria-label="Ganancias" aria-busy={earnings.isLoading}>
      <div className="whome__card-head">
        <h2 className="whome__card-title">Ganancias</h2>
        <div className="whome__segments" role="group" aria-label="Periodo">
          {PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="whome__segment"
              aria-pressed={period === option.id}
              onClick={() => setPeriod(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {data === null && earnings.isLoading ? (
        <div className="whome__loader"><DogLoader label="Cargando ganancias…" /></div>
      ) : null}
      {data === null && earnings.error !== null ? (
        <p className="whome__muted" role="alert">{translateApiError(earnings.error, "No pudimos cargar tus ganancias.")}</p>
      ) : null}

      {data !== null ? (
        <>
          <div className="earn__hero">
            <div className="earn__total">
              <p className="whome__money" aria-hidden="true">{formatCop(total)}</p>
              <p className="whome__muted">
                {data.walks} {data.walks === 1 ? "paseo" : "paseos"} · {formatCop(data.netCop)} netos
              </p>
              {data.previous !== undefined ? (
                <CompareChip period={period} net={data.netCop} previous={data.previous.netCop} />
              ) : null}
            </div>
            <GoalRing
              period={period}
              net={data.netCop}
              weeklyGoal={weeklyGoal}
              days={days.length}
              onSave={saveGoal}
            />
          </div>

          <div className="earn__body" key={`${period}-${data.from}`}>
            {isEmpty ? (
              <EmptyEarnings period={period} onRequests={onRequests} />
            ) : period === "day" ? (
              <DayList walks={data.dayWalks ?? []} />
            ) : period === "month" ? (
              <MonthArea days={days} bestDate={best?.date ?? null} />
            ) : (
              <WeekBars days={days} />
            )}
          </div>

          <ul className="earn__facts">
            {best !== null && period !== "day" ? (
              <li>Mejor día: {dayName(best.date)} · {formatCop(best.netCop)}</li>
            ) : null}
            {data.avgPerWalkCop !== undefined && data.avgPerWalkCop > 0 ? (
              <li>Promedio por paseo: {formatCop(data.avgPerWalkCop)}</li>
            ) : null}
            <li>Comisión simulada {data.commissionPct}%: {formatCop(data.commissionCop)}</li>
          </ul>

          <table className="earn__sr">
            <caption>Ganancias netas por día</caption>
            <tbody>
              {days.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{dayName(day.date)}</th>
                  <td>{formatCop(day.netCop)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}

/** Fixture for `?preview=walker`: a good week so every chart has something to draw. */
function previewEarnings(period: EarningsPeriod): Earnings {
  const week = [15000, 0, 22000, 18000, 0, 30000, 17000];
  const values = period === "day" ? [27000] : period === "month" ? Array.from({ length: 30 }, (_, i) => Math.round((Math.sin(i / 3) + 1.2) * 12000)) : week;
  const byDay = values.map((net, index) => ({
    date: `2026-${period === "month" ? "11" : "10"}-${String((period === "month" ? 1 : 19) + index).padStart(2, "0")}`,
    walks: net > 0 ? (period === "day" ? 2 : 1) : 0,
    grossCop: Math.round(net / 0.9),
    netCop: net,
  }));
  const net = byDay.reduce((sum, day) => sum + day.netCop, 0);
  const walks = byDay.reduce((sum, day) => sum + day.walks, 0);
  const best = byDay.reduce((top, day) => (day.netCop > top.netCop ? day : top), byDay[0]!);
  return {
    period,
    from: byDay[0]!.date,
    to: byDay[byDay.length - 1]!.date,
    simulated: true,
    commissionPct: 10,
    walks,
    grossCop: Math.round(net / 0.9),
    commissionCop: Math.round(net / 9),
    netCop: net,
    byDay,
    previous: { walks: walks - 1, netCop: Math.round(net * 0.85) },
    bestDay: { date: best.date, netCop: best.netCop },
    avgPerWalkCop: walks > 0 ? Math.round(net / walks) : 0,
    goalCop: 120000,
    dayWalks:
      period === "day"
        ? [
            { id: "d1", dogName: "Toby", requestedTime: "2026-10-27T13:00:00+00:00", netCop: 12600 },
            { id: "d2", dogName: "Kira", requestedTime: "2026-10-27T21:00:00+00:00", netCop: 14400 },
          ]
        : null,
  };
}
