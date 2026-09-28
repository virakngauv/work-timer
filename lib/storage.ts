import { currentState, type TimerEvent } from "@/lib/timer";

export const STORAGE_KEY = "work-timer:v1";

export interface PersistedWorkday {
  dateKey: string;
  events: TimerEvent[];
}

interface StoredPayload extends PersistedWorkday {
  version: 1;
}

function isTimerEvent(value: unknown): value is TimerEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<TimerEvent>;

  return (
    typeof event.id === "string" &&
    typeof event.at === "number" &&
    Number.isFinite(event.at) &&
    (event.state === "work" ||
      event.state === "break" ||
      event.state === "stopped")
  );
}

export function localDateKey(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function loadWorkday(): PersistedWorkday {
  const today = localDateKey();
  const empty: PersistedWorkday = { dateKey: today, events: [] };

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be denied by browser settings; fall back to an empty day.
    return empty;
  }
  if (!raw) return empty;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredPayload>;
    if (
      parsed.version !== 1 ||
      typeof parsed.dateKey !== "string" ||
      !Array.isArray(parsed.events) ||
      !parsed.events.every(isTimerEvent)
    ) {
      return empty;
    }

    if (parsed.dateKey !== today && currentState(parsed.events) === "stopped") {
      return empty;
    }

    return { dateKey: parsed.dateKey, events: parsed.events };
  } catch {
    return empty;
  }
}

export function saveWorkday(dateKey: string, events: TimerEvent[]): void {
  const payload: StoredPayload = { version: 1, dateKey, events };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
