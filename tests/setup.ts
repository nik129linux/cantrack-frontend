import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// Whole-suite runs are CPU-heavy: give async queries more room than the 1 s default.
configure({ asyncUtilTimeout: 4000 });
