import {
  appendTransition,
  currentState,
  editEventTimestamp,
  type TimerEvent,
  type TimerHistory,
  type TimerState,
} from "@/lib/timer";

export type TimerAction =
  | { type: "clear"; expectedEvents: TimerEvent[] }
  | { type: "transition"; from: TimerState; state: TimerState }
  | { type: "edit"; eventId: string; at: number };

export type TimerMutation =
  | { type: "clear" }
  | { type: "none" }
  | { type: "append"; event: TimerEvent }
  | { type: "edit"; event: TimerEvent };

export interface AppliedTimerAction {
  history: TimerHistory;
  mutation: TimerMutation;
}

function createEventId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function applyTimerAction(
  latest: TimerHistory,
  action: TimerAction,
  now: number,
  createId: () => string = createEventId,
): AppliedTimerAction {
  if (action.type === "clear") {
    if (currentState(latest.events) !== "stopped") {
      throw new Error("Stop the timer before clearing it.");
    }
    if (
      latest.events.length !== action.expectedEvents.length ||
      latest.events.some((event, index) => {
        const expected = action.expectedEvents[index];
        return (
          event.id !== expected.id ||
          event.at !== expected.at ||
          event.state !== expected.state
        );
      })
    ) {
      throw new Error(
        "Timer history changed. Cancel and review it before clearing.",
      );
    }
    return {
      history: { events: [] },
      mutation: { type: latest.events.length ? "clear" : "none" },
    };
  }
  if (action.type === "edit") {
    if (!Number.isFinite(action.at)) {
      throw new Error("Enter a valid date and time.");
    }
    if (action.at > now) {
      throw new Error("Session times cannot be in the future.");
    }

    const events = editEventTimestamp(latest.events, action.eventId, action.at);
    const event = events.find((item) => item.id === action.eventId);
    if (!event) throw new Error("Timer event not found.");
    return {
      history: { ...latest, events },
      mutation: { type: "edit", event },
    };
  }

  const state = currentState(latest.events);

  if (state === action.state) {
    return { history: latest, mutation: { type: "none" } };
  }
  if (state !== action.from && action.state !== "stopped") {
    throw new Error(
      "The timer changed in another tab. Check its current mode and try again.",
    );
  }

  const at = Math.max(now, (latest.events.at(-1)?.at ?? -Infinity) + 1);
  const events = appendTransition(latest.events, action.state, at, createId());
  const event = events.at(-1)!;
  return {
    history: { ...latest, events },
    mutation: { type: "append", event },
  };
}
