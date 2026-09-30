import {
  appendTransition,
  currentState,
  editEventTimestamp,
  type TimerEvent,
  type TimerState,
} from "@/lib/timer";
import { localDateKey, type PersistedWorkday } from "@/lib/storage";

export type WorkdayAction =
  | { type: "transition"; from: TimerState; state: TimerState }
  | { type: "edit"; eventId: string; at: number };

export type WorkdayMutation =
  | { type: "none" }
  | { type: "append"; event: TimerEvent }
  | { type: "edit"; event: TimerEvent }
  | { type: "reset"; dateKey: string; events: TimerEvent[] };

export interface AppliedWorkdayAction {
  workday: PersistedWorkday;
  mutation: WorkdayMutation;
}

export function visibleWorkday(
  workday: PersistedWorkday,
  now: number,
): PersistedWorkday {
  const today = localDateKey(now);
  if (workday.dateKey !== today && currentState(workday.events) === "stopped") {
    return { dateKey: today, events: [] };
  }
  return workday;
}

export function applyWorkdayAction(
  latest: PersistedWorkday,
  action: WorkdayAction,
  now: number,
  createId: () => string = () => crypto.randomUUID(),
): AppliedWorkdayAction {
  if (action.type === "edit") {
    if (!Number.isFinite(action.at)) {
      throw new Error("Enter a valid date and time.");
    }
    if (action.at > now) {
      throw new Error("A session cannot start in the future.");
    }

    const events = editEventTimestamp(latest.events, action.eventId, action.at);
    const event = events.find((item) => item.id === action.eventId);
    if (!event) throw new Error("Timer event not found.");
    return {
      workday: { ...latest, events },
      mutation: { type: "edit", event },
    };
  }

  const today = localDateKey(now);
  const reset =
    latest.dateKey !== today && currentState(latest.events) === "stopped";
  const base = reset ? { dateKey: today, events: [] } : latest;
  const state = currentState(base.events);

  if (state === action.state) {
    return { workday: base, mutation: { type: "none" } };
  }
  if (state !== action.from) {
    throw new Error(
      "The timer changed in another tab. Check its current mode and try again.",
    );
  }

  const at = Math.max(now, (base.events.at(-1)?.at ?? -Infinity) + 1);
  const events = appendTransition(base.events, action.state, at, createId());
  const event = events.at(-1)!;
  return {
    workday: { ...base, events },
    mutation: reset
      ? { type: "reset", dateKey: today, events }
      : { type: "append", event },
  };
}
