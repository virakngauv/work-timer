import { useSyncExternalStore } from "react";
import { readWorkday, transactWorkday } from "@/lib/workday-db";
import type { PersistedWorkday } from "@/lib/storage";
import type { WorkdayAction } from "@/lib/workday-actions";

export type { WorkdayAction } from "@/lib/workday-actions";

interface WorkdaySnapshot extends PersistedWorkday {
  error: string | null;
}

const CHANGE_CHANNEL = "work-timer:changes:v1";
const listeners = new Set<() => void>();
const SERVER_SNAPSHOT: WorkdaySnapshot = {
  dateKey: "",
  events: [],
  error: null,
};
let snapshot: WorkdaySnapshot = SERVER_SNAPSHOT;
let channel: BroadcastChannel | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not read timer data.";
}

function emitChange(): void {
  for (const listener of listeners) listener();
}

async function refreshWorkday(): Promise<void> {
  try {
    const workday = await readWorkday();
    snapshot = { ...workday, error: null };
  } catch (error) {
    snapshot = { ...snapshot, error: errorMessage(error) };
  }
  emitChange();
}

function handleVisibilityChange(): void {
  if (!document.hidden) void refreshWorkday();
}

function handleReturnToPage(): void {
  void refreshWorkday();
}

function openChangeChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel(CHANGE_CHANNEL);
  channel.addEventListener("message", handleReturnToPage);
  return channel;
}

function closeChangeChannel(): void {
  if (!channel) return;
  channel.close();
  channel = null;
}

export function subscribeToWorkday(listener: () => void): () => void {
  if (listeners.size === 0) {
    openChangeChannel();
    window.addEventListener("focus", handleReturnToPage);
    window.addEventListener("pageshow", handleReturnToPage);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void refreshWorkday();
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("focus", handleReturnToPage);
      window.removeEventListener("pageshow", handleReturnToPage);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      closeChangeChannel();
    }
  };
}

export function getWorkdaySnapshot(): WorkdaySnapshot {
  return snapshot;
}

export function getServerWorkdaySnapshot(): WorkdaySnapshot {
  return SERVER_SNAPSHOT;
}

export function useWorkday(): WorkdaySnapshot {
  return useSyncExternalStore(
    subscribeToWorkday,
    getWorkdaySnapshot,
    getServerWorkdaySnapshot,
  );
}

export async function dispatchWorkday(action: WorkdayAction): Promise<void> {
  const now = Date.now();
  const result = await transactWorkday(action, now);
  snapshot = { ...result.workday, error: null };
  emitChange();

  if (result.changed) {
    openChangeChannel()?.postMessage({ type: "changed" });
  }
  if (result.error) throw result.error;
}
