import { useSyncExternalStore } from "react";
import {
  appendTransition,
  currentState,
  editEventTimestamp,
  type TimerState,
} from "@/lib/timer";
import {
  loadWorkday,
  saveWorkday,
  STORAGE_KEY,
  type PersistedWorkday,
} from "@/lib/storage";

const listeners = new Set<() => void>();
const WRITE_LOCK = "work-timer:write";
let snapshot: PersistedWorkday | null = null;

// Server render has no localStorage; the empty dateKey keeps the UI inert
// until the client store attaches and useSyncExternalStore re-renders.
const SERVER_SNAPSHOT: PersistedWorkday = { dateKey: "", events: [] };

function emitChange(): void {
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent): void {
  if (event.storageArea && event.storageArea !== window.localStorage) return;
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  snapshot = null;
  emitChange();
}

export function subscribeToWorkday(listener: () => void): () => void {
  if (listeners.size === 0) {
    // Reload on first subscription so changes made while nothing was
    // mounted (or in another tab) are picked up.
    snapshot = null;
    window.addEventListener("storage", handleStorage);
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

export function getWorkdaySnapshot(): PersistedWorkday {
  snapshot ??= loadWorkday();
  return snapshot;
}

export function getServerWorkdaySnapshot(): PersistedWorkday {
  return SERVER_SNAPSHOT;
}

export function useWorkday(): PersistedWorkday {
  return useSyncExternalStore(
    subscribeToWorkday,
    getWorkdaySnapshot,
    getServerWorkdaySnapshot,
  );
}

export type WorkdayAction =
  | { type: "transition"; from: TimerState; state: TimerState }
  | { type: "edit"; eventId: string; at: number };

export async function dispatchWorkday(action: WorkdayAction): Promise<void> {
  if (!navigator.locks) {
    throw new Error(
      "This browser cannot safely save changes across tabs. Use a browser with Web Locks support.",
    );
  }

  await navigator.locks.request(WRITE_LOCK, () => {
    // Read inside the lock: a cached snapshot may predate another tab's write.
    const latest = loadWorkday(true);
    let next = latest;
    let committed = latest;
    try {
      if (action.type === "transition") {
        const state = currentState(latest.events);
        if (state !== action.state) {
          if (state !== action.from) {
            throw new Error(
              "The timer changed in another tab. Check its current mode and try again.",
            );
          }
          const at = Math.max(
            Date.now(),
            (latest.events.at(-1)?.at ?? -Infinity) + 1,
          );
          next = {
            ...latest,
            events: appendTransition(
              latest.events,
              action.state,
              at,
              crypto.randomUUID(),
            ),
          };
        }
      } else {
        if (!Number.isFinite(action.at))
          throw new Error("Enter a valid date and time.");
        if (action.at > Date.now())
          throw new Error("A session cannot start in the future.");
        next = {
          ...latest,
          events: editEventTimestamp(latest.events, action.eventId, action.at),
        };
      }

      if (next !== latest) {
        try {
          saveWorkday(next.dateKey, next.events);
          committed = next;
        } catch {
          throw new Error(
            "Could not save to browser storage. The change was not applied.",
          );
        }
      }
    } finally {
      // Publish only persisted data, including on a stale-action validation error.
      snapshot = committed;
      emitChange();
    }
  });
}
