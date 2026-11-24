import { useEffect, useState } from "react";

/** The map can remain visible after a dropped connection; make its age explicit. */
export function LocationFreshness({ at }: { at: number | string | null | undefined }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  if (at == null) return null;
  const timestamp = typeof at === "number" ? at * 1000 : Date.parse(at);
  if (!Number.isFinite(timestamp)) return null;
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const age = seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min`;
  return <p className={seconds > 45 ? "wg__warn" : "wg__muted"} role="status">
    {seconds > 45 ? `Ubicación sin actualizar desde hace ${age}. Puede estar retrasada.` : `Ubicación actualizada hace ${age}.`}
  </p>;
}
