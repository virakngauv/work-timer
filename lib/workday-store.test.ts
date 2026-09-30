import { beforeEach, describe, expect, it, vi } from "vitest";
import { installWebLocks } from "@/test/web-locks";
import {
  loadWorkday,
  localDateKey,
  saveWorkday,
  STORAGE_KEY,
} from "@/lib/storage";
import { dispatchWorkday, getWorkdaySnapshot } from "@/lib/workday-store";

const start = Date.now() - 60_000;

beforeEach(() => {
  installWebLocks();
  localStorage.clear();
  saveWorkday(localDateKey(), [{ id: "start", state: "work", at: start }]);
});

describe("locked workday actions", () => {
  it("coalesces simultaneous explicit transitions without toggling twice", async () => {
    await Promise.all([
      dispatchWorkday({ type: "transition", from: "work", state: "break" }),
      dispatchWorkday({ type: "transition", from: "work", state: "break" }),
    ]);
    expect(loadWorkday().events.map((event) => event.state)).toEqual([
      "work",
      "break",
    ]);
  });

  it("reads after acquiring the lock and preserves a queued boundary edit", async () => {
    const edit = dispatchWorkday({
      type: "edit",
      eventId: "start",
      at: start - 60_000,
    });
    const transition = dispatchWorkday({
      type: "transition",
      from: "work",
      state: "break",
    });
    await Promise.all([edit, transition]);
    expect(loadWorkday().events[0].at).toBe(start - 60_000);
    expect(loadWorkday().events.map((event) => event.state)).toEqual([
      "work",
      "break",
    ]);
  });

  it("validates a queued edit against a newly written boundary", async () => {
    vi.spyOn(Date, "now").mockReturnValue(start + 30_000);
    const transition = dispatchWorkday({
      type: "transition",
      from: "work",
      state: "break",
    });
    await transition;
    await expect(
      dispatchWorkday({ type: "edit", eventId: "start", at: start + 30_000 }),
    ).rejects.toThrow("before the next boundary");
    expect(loadWorkday().events[0].at).toBe(start);
  });

  it("does not let a stale resume restart a stopped day", async () => {
    await dispatchWorkday({ type: "transition", from: "work", state: "break" });
    await dispatchWorkday({
      type: "transition",
      from: "break",
      state: "stopped",
    });
    await expect(
      dispatchWorkday({ type: "transition", from: "break", state: "work" }),
    ).rejects.toThrow("changed in another tab");
    expect(getWorkdaySnapshot().events.at(-1)?.state).toBe("stopped");
  });

  it("keeps equal-clock transitions strictly chronological", async () => {
    vi.spyOn(Date, "now").mockReturnValue(start);
    await dispatchWorkday({ type: "transition", from: "work", state: "break" });
    await dispatchWorkday({ type: "transition", from: "break", state: "work" });
    expect(loadWorkday().events.map((event) => event.at)).toEqual([
      start,
      start + 1,
      start + 2,
    ]);
  });

  it("fails safely when Web Locks or storage reads are unavailable", async () => {
    const original = localStorage.getItem(STORAGE_KEY);
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
    await expect(
      dispatchWorkday({ type: "transition", from: "work", state: "break" }),
    ).rejects.toThrow("Web Locks");
    installWebLocks();
    const read = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    await expect(
      dispatchWorkday({ type: "transition", from: "work", state: "break" }),
    ).rejects.toThrow("Could not read");
    read.mockRestore();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
  });

  it("does not publish a failed write and releases the lock", async () => {
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    await expect(
      dispatchWorkday({ type: "transition", from: "work", state: "break" }),
    ).rejects.toThrow("Could not save");
    expect(getWorkdaySnapshot().events).toEqual(loadWorkday().events);
    write.mockRestore();
    await dispatchWorkday({ type: "transition", from: "work", state: "break" });
    expect(loadWorkday().events.at(-1)?.state).toBe("break");
  });

  it("starts a new day after an old stopped day but retains an overnight active day", async () => {
    saveWorkday("2000-01-01", [
      { id: "old", state: "work", at: start - 1 },
      { id: "stop", state: "stopped", at: start },
    ]);
    await dispatchWorkday({
      type: "transition",
      from: "stopped",
      state: "work",
    });
    expect(loadWorkday().dateKey).toBe(localDateKey());
    expect(loadWorkday().events).toHaveLength(1);
    saveWorkday("2000-01-01", [{ id: "old", state: "work", at: start }]);
    await dispatchWorkday({ type: "transition", from: "work", state: "break" });
    expect(loadWorkday().dateKey).toBe("2000-01-01");
    expect(loadWorkday().events).toHaveLength(2);
  });
});
