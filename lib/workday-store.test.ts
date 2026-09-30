import { describe, expect, it } from "vitest";
import { localDateKey, type PersistedWorkday } from "@/lib/storage";
import { applyWorkdayAction } from "@/lib/workday-actions";

const start = new Date(2026, 8, 29, 12, 0, 0).getTime();
const base: PersistedWorkday = {
  dateKey: localDateKey(start),
  events: [{ id: "start", state: "work", at: start }],
};

function id(): string {
  return "next";
}

describe("workday actions", () => {
  it.each(["work", "break"] as const)(
    "allows Stop Day from a stale %s mode after another tab switches",
    (from) => {
      const latest: PersistedWorkday = {
        ...base,
        events:
          from === "work"
            ? [
                ...base.events,
                { id: "break", state: "break", at: start + 1_000 },
              ]
            : base.events,
      };
      const result = applyWorkdayAction(
        latest,
        { type: "transition", from, state: "stopped" },
        start + 2_000,
        id,
      );
      expect(result.mutation.type).toBe("append");
      expect(result.workday.events.at(-1)?.state).toBe("stopped");
      expect(result.workday.events.slice(0, -1)).toEqual(latest.events);
    },
  );

  it("coalesces a repeated explicit transition instead of toggling twice", () => {
    const first = applyWorkdayAction(
      base,
      { type: "transition", from: "work", state: "break" },
      start + 1_000,
      id,
    );
    const second = applyWorkdayAction(
      first.workday,
      { type: "transition", from: "work", state: "break" },
      start + 2_000,
      id,
    );

    expect(second.mutation.type).toBe("none");
    expect(second.workday.events.map((event) => event.state)).toEqual([
      "work",
      "break",
    ]);
  });

  it("preserves a boundary edit followed by a transition", () => {
    const edited = applyWorkdayAction(
      base,
      {
        type: "edit",
        eventId: "start",
        at: start - 60_000,
      },
      start + 1_000,
    );
    const transitioned = applyWorkdayAction(
      edited.workday,
      { type: "transition", from: "work", state: "break" },
      start + 2_000,
      id,
    );

    expect(transitioned.workday.events[0].at).toBe(start - 60_000);
    expect(transitioned.workday.events.map((event) => event.state)).toEqual([
      "work",
      "break",
    ]);
  });

  it("validates an edit against a newly committed boundary", () => {
    const transitioned = applyWorkdayAction(
      base,
      { type: "transition", from: "work", state: "break" },
      start + 30_000,
      id,
    );

    expect(() =>
      applyWorkdayAction(
        transitioned.workday,
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
    const stopped: PersistedWorkday = {
      ...base,
      events: [
        ...base.events,
        { id: "break", state: "break", at: start + 1_000 },
        { id: "stop", state: "stopped", at: start + 2_000 },
      ],
    };

    expect(() =>
      applyWorkdayAction(
        stopped,
        { type: "transition", from: "break", state: "work" },
        start + 3_000,
        id,
      ),
    ).toThrow("changed in another tab");
  });

  it("keeps equal-clock transitions strictly chronological", () => {
    const first = applyWorkdayAction(
      base,
      { type: "transition", from: "work", state: "break" },
      start,
      id,
    );
    const second = applyWorkdayAction(
      first.workday,
      { type: "transition", from: "break", state: "work" },
      start,
      () => "third",
    );

    expect(second.workday.events.map((event) => event.at)).toEqual([
      start,
      start + 1,
      start + 2,
    ]);
  });

  it("starts a new day after an old stopped day but retains an overnight active day", () => {
    const now = new Date(2026, 8, 30, 0, 0, 1).getTime();
    const oldStopped: PersistedWorkday = {
      dateKey: localDateKey(start),
      events: [
        { id: "old", state: "work", at: start },
        { id: "stop", state: "stopped", at: start + 1_000 },
      ],
    };
    const restarted = applyWorkdayAction(
      oldStopped,
      { type: "transition", from: "stopped", state: "work" },
      now,
      id,
    );

    expect(restarted.mutation.type).toBe("reset");
    expect(restarted.workday.dateKey).toBe(localDateKey(now));
    expect(restarted.workday.events).toHaveLength(1);
    expect(restarted.workday.events[0].at).toBe(now);

    const overnight = applyWorkdayAction(
      { dateKey: localDateKey(start), events: base.events },
      { type: "transition", from: "work", state: "break" },
      now,
      id,
    );
    expect(overnight.workday.dateKey).toBe(localDateKey(start));
    expect(overnight.workday.events).toHaveLength(2);
  });

  it("uses the same clock sample for rollover date selection and transition time", () => {
    const now = new Date(2026, 8, 30, 0, 0, 0).getTime();
    const oldStopped: PersistedWorkday = {
      dateKey: "2026-09-29",
      events: [
        { id: "old", state: "work", at: now - 2_000 },
        { id: "stop", state: "stopped", at: now - 1_000 },
      ],
    };
    const result = applyWorkdayAction(
      oldStopped,
      { type: "transition", from: "stopped", state: "work" },
      now,
      id,
    );

    expect(result.workday.dateKey).toBe(localDateKey(now));
    expect(result.workday.events[0].at).toBe(now);
  });
});
