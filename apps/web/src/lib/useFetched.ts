import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./apiError.js";

export type Fetched<T> = {
  data: T | null;
  error: unknown;
  isLoading: boolean;
  /** True when the last refetch failed but an older answer is still shown. */
  isStale: boolean;
  reload: () => void;
};

type Options<T> = {
  /** Refetch every `pollMs` while this returns true for the latest data. */
  pollMs?: number;
  shouldPoll?: (data: T | null) => boolean;
};

/**
 * Load once on mount (and whenever `deps` change), optionally poll, and keep
 * the last good answer when a refetch fails: the screens show "Sin conexión"
 * over it instead of blanking.
 */
export function useFetched<T>(
  load: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  { pollMs, shouldPoll }: Options<T> = {},
): Fetched<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const mounted = useRef(true);
  const dataRef = useRef<T | null>(null);

  const run = useCallback(async () => {
    try {
      const next = await loadRef.current();
      if (mounted.current) {
        dataRef.current = next;
        setData(next);
        setError(null);
      }
    } catch (failure: unknown) {
      if (mounted.current) {
        setError(failure);
      }
    } finally {
      if (mounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    dataRef.current = null;
    setData(null);
    setIsLoading(true);
    void run();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (pollMs === undefined) {
      return;
    }
    const id = window.setInterval(() => {
      // A 429 asks us to wait: skip this tick rather than hammer the API.
      if (shouldPoll !== undefined && !shouldPoll(dataRef.current)) {
        return;
      }
      void run();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, shouldPoll, run]);

  return {
    data,
    error,
    isLoading,
    isStale: data !== null && error !== null,
    reload: () => void run(),
  };
}

/** The status of an API failure, or null for anything else (network, bug). */
export function statusOf(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}
