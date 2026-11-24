import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { beforeEach } from "vitest";

const fallbackLocalStorage = new Map<string, string>();

beforeEach(() => {
  if (typeof window !== "undefined" && typeof window.localStorage === "undefined") {
    const storage: Storage = {
      get length() { return fallbackLocalStorage.size; },
      clear: () => fallbackLocalStorage.clear(),
      getItem: (key) => fallbackLocalStorage.get(key) ?? null,
      key: (index) => [...fallbackLocalStorage.keys()][index] ?? null,
      removeItem: (key) => fallbackLocalStorage.delete(key),
      setItem: (key, value) => fallbackLocalStorage.set(key, String(value)),
    };
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  }
  fallbackLocalStorage.clear();
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
});

// Whole-suite runs are CPU-heavy: give async queries more room than the 1 s default.
configure({ asyncUtilTimeout: 4000 });
