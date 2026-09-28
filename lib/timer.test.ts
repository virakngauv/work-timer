import { describe, expect, it } from "vitest";
import {
  appendTransition,
  calculateTotals,
  deriveSegments,
  editEventTimestamp,
  type TimerEvent,
} from "@/lib/timer";

describe("timer domain", () => {
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
});
