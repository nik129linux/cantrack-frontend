// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFetched } from "../../apps/web/src/lib/useFetched.js";

afterEach(cleanup);
describe("Fetched data recovery", () => {
  it("ignores the old account's delayed response after its dependencies change", async () => {
    let resolveOld!: (value: string) => void;
    const old = new Promise<string>((resolve) => { resolveOld = resolve; });
    const { result, rerender } = renderHook(({ id }) => useFetched(() => id === "old" ? old : Promise.resolve("new account"), [id]), { initialProps: { id: "old" } });
    rerender({ id: "new" });
    await waitFor(() => expect(result.current.data).toBe("new account"));
    await act(async () => resolveOld("old account"));
    expect(result.current.data).toBe("new account");
  });

  it("refreshes on reconnection while retaining the last answer after a failure", async () => {
    const load = vi.fn().mockResolvedValueOnce("saved").mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue("updated");
    const { result } = renderHook(() => useFetched(load, []));
    await waitFor(() => expect(result.current.data).toBe("saved"));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.isStale).toBe(true));
    expect(result.current.data).toBe("saved");
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(result.current.data).toBe("updated"));
    expect(result.current.isStale).toBe(false);
  });
});
