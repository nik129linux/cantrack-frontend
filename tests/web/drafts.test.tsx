// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { clearSessionDrafts, useDraftState } from "../../apps/web/src/lib/useDraftState.js";
afterEach(cleanup);
describe("Session form drafts", () => {
  it("restores an unfinished form after remounting without sharing it with another account", () => {
    const first = renderHook(() => useDraftState("request:owner-a:when", ""));
    act(() => first.result.current[1]("2026-12-01T09:00"));
    first.unmount();
    const restored = renderHook(() => useDraftState("request:owner-a:when", ""));
    expect(restored.result.current[0]).toBe("2026-12-01T09:00");
    const other = renderHook(() => useDraftState("request:owner-b:when", ""));
    expect(other.result.current[0]).toBe("");
    act(() => clearSessionDrafts());
    expect(sessionStorage.length).toBe(0);
  });
  it("removes a draft after the server's saved value becomes the new baseline", () => {
    const { result, rerender } = renderHook(({ saved }) => useDraftState("dog:d1:notes", saved), { initialProps: { saved: "Original" } });
    act(() => result.current[1]("Changed"));
    expect(sessionStorage.length).toBe(1);
    rerender({ saved: "Changed" });
    expect(sessionStorage.length).toBe(0);
  });
});
