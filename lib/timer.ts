export type TimerState = "work" | "break" | "stopped";
export type ActiveTimerState = Exclude<TimerState, "stopped">;

export interface TimerEvent {
  id: string;
  at: number;
  state: TimerState;
}

export interface TimerHistory {
  events: TimerEvent[];
}

export interface TimerSegment {
  eventId: string;
  state: ActiveTimerState;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
  active: boolean;
}

export interface TimerTotals {
  workMs: number;
  breakMs: number;
  currentMs: number;
  state: TimerState;
}

export function currentState(events: TimerEvent[]): TimerState {
  return events.at(-1)?.state ?? "stopped";
}

export function canTransition(
  previous: TimerState | null,
  next: TimerState,
): boolean {
  if (previous === null || previous === "stopped") {
    return next === "work" || next === "break";
  }
  if (previous === "work") return next === "break" || next === "stopped";
  return next === "work" || next === "stopped";
}

export function appendTransition(
  events: TimerEvent[],
  state: TimerState,
  at: number,
  id: string,
): TimerEvent[] {
  const previous = events.at(-1) ?? null;

  if (!canTransition(previous?.state ?? null, state)) {
    throw new Error(
      `Invalid timer transition from ${previous?.state ?? "empty"} to ${state}.`,
    );
  }

  if (previous && at <= previous.at) {
    throw new Error("Timer events must be strictly chronological.");
  }

  return [...events, { id, at, state }];
}

export function deriveSegments(
  events: TimerEvent[],
  now: number,
): TimerSegment[] {
  return events.flatMap((event, index) => {
    if (event.state === "stopped") return [];

    const next = events[index + 1];
    const endedAt = next?.at ?? null;
    const effectiveEnd = endedAt ?? now;

    return [
      {
        eventId: event.id,
        state: event.state,
        startedAt: event.at,
        endedAt,
        // Quantize shared boundaries before subtraction so all active counters
        // advance together, without accumulating fractional seconds from history.
        durationMs:
          Math.max(
            0,
            Math.floor(effectiveEnd / 1000) - Math.floor(event.at / 1000),
          ) * 1000,
        active: endedAt === null,
      },
    ];
  });
}

export function calculateTotals(
  events: TimerEvent[],
  now: number,
): TimerTotals {
  const segments = deriveSegments(events, now);
  const state = currentState(events);

  const workMs = segments
    .filter((segment) => segment.state === "work")
    .reduce((total, segment) => total + segment.durationMs, 0);

  const breakMs = segments
    .filter((segment) => segment.state === "break")
    .reduce((total, segment) => total + segment.durationMs, 0);

  const currentMs = segments.find((segment) => segment.active)?.durationMs ?? 0;

  return { workMs, breakMs, currentMs, state };
}

export function editEventTimestamp(
  events: TimerEvent[],
  eventId: string,
  nextTimestamp: number,
): TimerEvent[] {
  const index = events.findIndex((event) => event.id === eventId);
  if (index === -1) throw new Error("Timer event not found.");

  const previous = events[index - 1];
  const next = events[index + 1];

  if (previous && nextTimestamp <= previous.at) {
    throw new Error("Start time must be after the previous boundary.");
  }

  if (next && nextTimestamp >= next.at) {
    throw new Error("Start time must be before the next boundary.");
  }

  return events.map((event, eventIndex) =>
    eventIndex === index ? { ...event, at: nextTimestamp } : event,
  );
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
}

export function formatSessionDuration(ms: number): string {
  const formatted = formatDuration(ms);
  return ms < 3_600_000 ? formatted.slice(3) : formatted;
}

export function formatClockTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function formatTimeRange(
  start: number,
  end: number | null,
  locale?: string,
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (end === null) return `${formatter.format(start)} –`;
  const startParts = formatter.formatToParts(start);
  const endParts = formatter.formatToParts(end);
  const startPeriod = startParts.find(
    (part) => part.type === "dayPeriod",
  )?.value;
  const endPeriod = endParts.find((part) => part.type === "dayPeriod")?.value;
  const startText =
    startPeriod && startPeriod === endPeriod
      ? startParts
          .filter((part) => part.type !== "dayPeriod")
          .map((part) => part.value)
          .join("")
          .trim()
      : formatter.format(start);
  return `${startText} – ${formatter.format(end)}`;
}

export function toLocalDateTimeInput(ms: number): string {
  const date = new Date(ms);
  const local = new Date(ms - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19);
}

export function fromLocalDateTimeInput(value: string): number {
  return new Date(value).getTime();
}
