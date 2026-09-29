import { useSyncExternalStore } from "react";
import {
  loadWorkday,
  saveWorkday,
  STORAGE_KEY,
  type PersistedWorkday,
} from "@/lib/storage";

const listeners = new Set<() => void>();
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

export function writeWorkday(next: PersistedWorkday): void {
  // Persist before publishing so a failed write (quota, blocked storage)
  // leaves the snapshot consistent with what is actually stored. The error
  // propagates to the caller, which can surface it.
  saveWorkday(next.dateKey, next.events);
  snapshot = next;
  emitChange();
}
