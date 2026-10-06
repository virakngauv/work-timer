import { describe, expect, it } from "vitest";
import { calculateTotals, type TimerHistory } from "@/lib/timer";
import { applyTimerAction } from "@/lib/timer-actions";

const start = new Date(2026, 8, 29, 12, 0, 0).getTime();
const base: TimerHistory = {
  events: [{ id: "start", state: "work", at: start }],
};

function id(): string {
  return "next";
}

describe("history actions", () => {
  it.each(["work", "break"] as const)(
    "allows Stop from a stale %s mode after another tab switches",
    (from) => {
      const latest: TimerHistory = {
        ...base,
        events:
          from === "work"
            ? [
                ...base.events,
                { id: "break", state: "break", at: start + 1_000 },
              ]
            : base.events,
      };
      const result = applyTimerAction(
        latest,
        { type: "transition", from, state: "stopped" },
        start + 2_000,
        id,
      );
      expect(result.mutation.type).toBe("append");
      expect(result.history.events.at(-1)?.state).toBe("stopped");
      expect(result.history.events.slice(0, -1)).toEqual(latest.events);
    },
  );

  it("coalesces a repeated explicit transition instead of toggling twice", () => {
    const first = applyTimerAction(
      base,
      { type: "transition", from: "work", state: "break" },
      start + 1_000,
      id,
    );
    const second = applyTimerAction(
      first.history,
      { type: "transition", from: "work", state: "break" },
      start + 2_000,
      id,
    );

    expect(second.mutation.type).toBe("none");
    expect(second.history.events.map((event) => event.state)).toEqual([
      "work",
      "break",
    ]);
  });

  it("preserves a boundary edit followed by a transition", () => {
    const edited = applyTimerAction(
      base,
      {
        type: "edit",
        eventId: "start",
        at: start - 60_000,
      },
      start + 1_000,
    );
    const transitioned = applyTimerAction(
      edited.history,
      { type: "transition", from: "work", state: "break" },
      start + 2_000,
      id,
    );

    expect(transitioned.history.events[0].at).toBe(start - 60_000);
    expect(transitioned.history.events.map((event) => event.state)).toEqual([
      "work",
      "break",
    ]);
  });

  it("validates an edit against a newly committed boundary", () => {
    const transitioned = applyTimerAction(
      base,
      { type: "transition", from: "work", state: "break" },
      start + 30_000,
      id,
    );

    expect(() =>
      applyTimerAction(
        transitioned.history,
        {
          type: "edit",
          eventId: "start",
          at: start + 30_000,
        },
        start + 30_000,
      ),
    ).toThrow("before the next boundary");
  });

  it("rejects an incompatible stale transition", () => {
    const stopped: TimerHistory = {
      ...base,
      events: [
        ...base.events,
        { id: "break", state: "break", at: start + 1_000 },
        { id: "stop", state: "stopped", at: start + 2_000 },
      ],
    };

    expect(() =>
      applyTimerAction(
        stopped,
        { type: "transition", from: "break", state: "work" },
        start + 3_000,
        id,
      ),
    ).toThrow("changed in another tab");
  });

  it("keeps equal-clock transitions strictly chronological", () => {
    const first = applyTimerAction(
      base,
      { type: "transition", from: "work", state: "break" },
      start,
      id,
    );
    const second = applyTimerAction(
      first.history,
      { type: "transition", from: "break", state: "work" },
      start,
      () => "third",
    );

    expect(second.history.events.map((event) => event.at)).toEqual([
      start,
      start + 1,
      start + 2,
    ]);
  });

  it.each(["work", "break"] as const)(
    "retains stopped history when restarting %s on a later date",
    (state) => {
      const now = new Date(2026, 8, 30, 0, 0, 1).getTime();
      const stopped: TimerHistory = {
        events: [
          { id: "old", state: "work", at: start },
          { id: "stop", state: "stopped", at: start + 60_000 },
        ],
      };
      const restarted = applyTimerAction(
        stopped,
        { type: "transition", from: "stopped", state },
        now,
        id,
      );
      expect(restarted.mutation.type).toBe("append");
      expect(restarted.history.events.slice(0, -1)).toEqual(stopped.events);
      expect(restarted.history.events.at(-1)).toEqual({
        id: "next",
        state,
        at: now,
      });
      expect(calculateTotals(restarted.history.events, now).workMs).toBe(
        60_000,
      );
    },
  );

  it("keeps an active session across midnight", () => {
    const now = new Date(2026, 8, 30, 0, 0, 1).getTime();
    const overnight = applyTimerAction(
      base,
      { type: "transition", from: "work", state: "break" },
      now,
      id,
    );
    expect(overnight.history.events[0]).toEqual(base.events[0]);
    expect(calculateTotals(overnight.history.events, now).workMs).toBe(
      now - start,
    );
  });
  it("clears stopped history and both totals", () => {
    const history: TimerHistory = {
      events: [
        ...base.events,
        { id: "stop", state: "stopped", at: start + 60_000 },
      ],
    };
    const result = applyTimerAction(
      history,
      { type: "clear", expectedEvents: history.events },
      start + 120_000,
    );
    expect(result.mutation).toEqual({ type: "clear" });
    expect(result.history.events).toEqual([]);
    expect(calculateTotals(result.history.events, start + 120_000)).toEqual({
      workMs: 0,
      breakMs: 0,
      currentMs: 0,
      state: "stopped",
    });
  });

  it.each(["work", "break"] as const)("clears a running %s timer", (state) => {
    const history: TimerHistory = {
      events: [{ id: "active", at: start, state }],
    };
    const result = applyTimerAction(
      history,
      { type: "clear", expectedEvents: history.events },
      start + 60_000,
    );
    expect(result.mutation).toEqual({ type: "clear" });
    expect(result.history.events).toEqual([]);
    expect(calculateTotals(result.history.events, start + 120_000)).toEqual({
      workMs: 0,
      breakMs: 0,
      currentMs: 0,
      state: "stopped",
    });
  });

  it("clearing empty history is a no-op", () => {
    expect(
      applyTimerAction(
        { events: [] },
        { type: "clear", expectedEvents: [] },
        start,
      ).mutation,
    ).toEqual({ type: "none" });
  });

  it("rejects a confirmation after history is edited in another tab", () => {
    const stopped: TimerHistory = {
      events: [
        ...base.events,
        { id: "stop", state: "stopped", at: start + 60_000 },
      ],
    };
    const edited = {
      events: stopped.events.map((event) => ({
        ...event,
        at: event.at - 1_000,
      })),
    };
    expect(() =>
      applyTimerAction(
        edited,
        { type: "clear", expectedEvents: stopped.events },
        start + 120_000,
      ),
    ).toThrow("Timer history changed");
    expect(edited.events).toHaveLength(2);
  });
});
