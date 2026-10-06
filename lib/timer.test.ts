import { describe, expect, it } from "vitest";
import {
  appendTransition,
  calculateTotals,
  deriveSegments,
  editEventTimestamp,
  formatSessionDuration,
  formatLiveDuration,
  formatTimeRange,
  type TimerEvent,
} from "@/lib/timer";

describe("timer domain", () => {
  it.each([
    [0, "00:00"],
    [59_999, "00:59"],
    [60_000, "01:00"],
    [3_599_999, "59:59"],
    [3_600_000, "01:00:00"],
    [5_400_000, "01:30:00"],
    [5_459_999, "01:30:59"],
  ])("formats a session lasting %i ms as %s", (ms, expected) => {
    expect(formatSessionDuration(ms)).toBe(expected);
  });

  it.each([
    [-100, "00:00:00.0"],
    [99, "00:00:00.0"],
    [100, "00:00:00.1"],
    [59_999, "00:00:59.9"],
    [60_000, "00:01:00.0"],
    [3_600_100, "01:00:00.1"],
    [360_000_900, "100:00:00.9"],
  ])("formats a live duration of %i ms as %s", (ms, expected) => {
    expect(formatLiveDuration(ms)).toBe(expected);
  });

  it.each(["work", "break"] as const)(
    "keeps the current %s session and total synchronized at tenth boundaries",
    (state) => {
      const other = state === "work" ? "break" : "work";
      const events: TimerEvent[] = [
        { id: "first", state, at: 150 },
        { id: "other", state: other, at: 1850 },
        { id: "current", state, at: 2350 },
      ];
      const totalKey = state === "work" ? "workMs" : "breakMs";
      const before = calculateTotals(events, 2399, 100);
      const tick = calculateTotals(events, 2400, 100);
      expect(before.currentMs).toBe(0);
      expect(before[totalKey]).toBe(1700);
      expect(tick.currentMs).toBe(100);
      expect(tick[totalKey]).toBe(1800);
      expect(calculateTotals(events, 2499, 100)).toEqual(tick);
      expect(deriveSegments(events, 2499).at(-1)?.durationMs).toBe(0);
      const stopped = [
        ...events,
        { id: "stop", state: "stopped" as const, at: 2450 },
      ];
      expect(calculateTotals(stopped, 9999, 100)).toEqual({
        workMs: state === "work" ? 1800 : 500,
        breakMs: state === "break" ? 1800 : 500,
        currentMs: 0,
        state: "stopped",
      });
    },
  );

  it("derives work and break intervals from explicit state transitions", () => {
    const events: TimerEvent[] = [
      { id: "1", at: 0, state: "work" },
      { id: "2", at: 60_000, state: "break" },
      { id: "3", at: 90_000, state: "work" },
      { id: "4", at: 150_000, state: "stopped" },
    ];

    expect(deriveSegments(events, 200_000)).toMatchObject([
      { state: "work", startedAt: 0, endedAt: 60_000, durationMs: 60_000 },
      {
        state: "break",
        startedAt: 60_000,
        endedAt: 90_000,
        durationMs: 30_000,
      },
      {
        state: "work",
        startedAt: 90_000,
        endedAt: 150_000,
        durationMs: 60_000,
      },
    ]);

    expect(calculateTotals(events, 200_000)).toEqual({
      workMs: 120_000,
      breakMs: 30_000,
      currentMs: 0,
      state: "stopped",
    });
  });

  it("moves one shared boundary when correcting a forgotten switch", () => {
    const events: TimerEvent[] = [
      { id: "work", at: 0, state: "work" },
      { id: "break", at: 10 * 60_000, state: "break" },
      { id: "back", at: 35 * 60_000, state: "work" },
    ];

    const corrected = editEventTimestamp(events, "back", 30 * 60_000);
    const segments = deriveSegments(corrected, 40 * 60_000);

    expect(segments[1].durationMs).toBe(20 * 60_000);
    expect(segments[2].durationMs).toBe(10 * 60_000);
  });

  it("rejects invalid transitions and boundary crossings", () => {
    const started = appendTransition([], "work", 1_000, "1");

    expect(() => appendTransition(started, "work", 2_000, "2")).toThrow();
    expect(() =>
      editEventTimestamp(
        [
          { id: "1", at: 1_000, state: "work" },
          { id: "2", at: 2_000, state: "break" },
          { id: "3", at: 3_000, state: "work" },
        ],
        "2",
        3_000,
      ),
    ).toThrow();
  });
  it.each(["work", "break"] as const)(
    "ticks current and %s total together at whole-second boundaries",
    (state) => {
      const other = state === "work" ? "break" : "work";
      const events: TimerEvent[] = [
        { id: "first", state, at: 100 },
        { id: "other", state: other, at: 1800 },
        { id: "current", state, at: 2300 },
      ];
      const totalKey = state === "work" ? "workMs" : "breakMs";
      const before = calculateTotals(events, 2900);
      expect(before.currentMs).toBe(0);
      expect(before[totalKey]).toBe(1000);
      const tick = calculateTotals(events, 3000);
      expect(tick.currentMs - before.currentMs).toBe(1000);
      expect(tick[totalKey] - before[totalKey]).toBe(1000);
      expect(calculateTotals(events, 3999)).toEqual(tick);
      expect(
        deriveSegments(events, 3999).every(
          (segment) => segment.durationMs % 1000 === 0,
        ),
      ).toBe(true);
    },
  );
  it("compacts shared AM/PM but keeps different periods and unfinished ranges clear", () => {
    const start = new Date(2026, 0, 15, 15, 40).getTime();
    expect(
      formatTimeRange(start, new Date(2026, 0, 15, 15, 53).getTime(), "en-US"),
    ).toMatch(/^3:40 – 3:53\sPM$/);
    expect(
      formatTimeRange(new Date(2026, 0, 15, 11, 40).getTime(), start, "en-US"),
    ).toMatch(/^11:40\sAM – 3:40\sPM$/);
    expect(formatTimeRange(start, null, "en-US")).toMatch(/^3:40\sPM –$/);
    expect(formatTimeRange(start, start + 13 * 60_000, "en-GB")).toBe(
      "15:40 – 15:53",
    );
  });
});
