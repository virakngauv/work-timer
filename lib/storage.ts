import { canTransition, type TimerEvent, type TimerState } from "@/lib/timer";

export const STORAGE_KEY = "work-timer:v1";

export interface PersistedWorkday {
  dateKey: string;
  events: TimerEvent[];
}

interface StoredPayload extends PersistedWorkday {
  version: 1;
}

function invalidLegacyData(): Error {
  return new Error(
    "Existing timer data is unreadable. It was left unchanged so it can be recovered manually.",
  );
}

function isTimerEvent(value: unknown): value is TimerEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<TimerEvent>;

  return (
    typeof event.id === "string" &&
    event.id.length > 0 &&
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

export function parseLegacyWorkday(raw: string): PersistedWorkday {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalidLegacyData();
  }

  if (!parsed || typeof parsed !== "object") throw invalidLegacyData();
  const payload = parsed as Partial<StoredPayload>;
  if (
    payload.version !== 1 ||
    typeof payload.dateKey !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(payload.dateKey) ||
    !Array.isArray(payload.events) ||
    !payload.events.every(isTimerEvent)
  ) {
    throw invalidLegacyData();
  }

  const ids = new Set<string>();
  let previousState: TimerState | null = null;
  let previousAt = -Infinity;
  for (const event of payload.events) {
    if (
      ids.has(event.id) ||
      event.at <= previousAt ||
      !canTransition(previousState, event.state)
    ) {
      throw invalidLegacyData();
    }
    ids.add(event.id);
    previousAt = event.at;
    previousState = event.state;
  }

  return { dateKey: payload.dateKey, events: payload.events };
}

export function readLegacyWorkday(): PersistedWorkday | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error(
      "Could not read existing timer data. It was left unchanged so it can be recovered manually.",
    );
  }

  return raw === null ? null : parseLegacyWorkday(raw);
}
