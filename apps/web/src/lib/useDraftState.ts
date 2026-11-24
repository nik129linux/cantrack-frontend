import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const PREFIX = "cantrack:draft:";

export function hasSessionDraft(key: string): boolean {
  try { return sessionStorage.getItem(PREFIX + key) !== null; } catch { return false; }
}

/** Text and form values only: never tokens, passwords or File objects. */
export function useDraftState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const baseline = typeof initial === "function" ? (initial as () => T)() : initial;
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(PREFIX + key);
      if (stored === null) return baseline;
      const parsed: unknown = JSON.parse(stored);
      if (baseline !== null && (typeof parsed !== typeof baseline || Array.isArray(parsed) !== Array.isArray(baseline))) return baseline;
      return parsed as T;
    } catch { return baseline; }
  });
  const baselineJson = JSON.stringify(baseline);
  useEffect(() => {
    try {
      const serialized = JSON.stringify(value);
      if (serialized === baselineJson) sessionStorage.removeItem(PREFIX + key);
      else sessionStorage.setItem(PREFIX + key, serialized);
    } catch { /* Private browsing or full storage must not block editing. */ }
  }, [key, value, baselineJson]);
  return [value, setValue];
}

export function clearSessionDrafts(scope = "") {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(PREFIX + scope)) sessionStorage.removeItem(key);
    }
  } catch { /* Signing out must work even when storage is unavailable. */ }
}
