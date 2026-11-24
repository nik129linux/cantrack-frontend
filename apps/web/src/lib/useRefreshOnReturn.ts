import { useEffect, useRef } from "react";

/** Refresh visible data after reconnecting or returning to the app. */
export function useRefreshOnReturn(refresh: () => void) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== "hidden") latest.current();
    };
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
}
