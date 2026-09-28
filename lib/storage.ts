import type { TimerEvent } from "@/lib/timer";

const STORAGE_KEY = "work-timer:v1";

interface PersistedTimer {
  version: 1;
  events: TimerEvent[];
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

export function loadEvents(): TimerEvent[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedTimer>;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.events) ||
      !parsed.events.every(isTimerEvent)
    ) {
      return [];
    }

    return parsed.events;
  } catch {
    return [];
  }
}

export function saveEvents(events: TimerEvent[]): void {
  const payload: PersistedTimer = { version: 1, events };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
