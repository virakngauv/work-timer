import { useSyncExternalStore } from "react";
import { readTimerHistory, transactTimer } from "@/lib/timer-db";
import type { TimerHistory } from "@/lib/timer";
import type { TimerAction } from "@/lib/timer-actions";

export type { TimerAction } from "@/lib/timer-actions";

interface TimerSnapshot extends TimerHistory {
  initialized: boolean;
  error: string | null;
}

const CHANGE_CHANNEL = "work-timer:changes:v1";
const listeners = new Set<() => void>();
const SERVER_SNAPSHOT: TimerSnapshot = {
  initialized: false,
  events: [],
  error: null,
};
let snapshot: TimerSnapshot = SERVER_SNAPSHOT;
let channel: BroadcastChannel | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not read timer data.";
}

function emitChange(): void {
  for (const listener of listeners) listener();
}

async function refreshTimer(): Promise<void> {
  try {
    const history = await readTimerHistory();
    snapshot = { ...history, initialized: true, error: null };
  } catch (error) {
    snapshot = { ...snapshot, error: errorMessage(error) };
  }
  emitChange();
}

function handleVisibilityChange(): void {
  if (!document.hidden) void refreshTimer();
}

function handleReturnToPage(): void {
  void refreshTimer();
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

export function subscribeToTimer(listener: () => void): () => void {
  if (listeners.size === 0) {
    openChangeChannel();
    window.addEventListener("focus", handleReturnToPage);
    window.addEventListener("pageshow", handleReturnToPage);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void refreshTimer();
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("focus", handleReturnToPage);
      window.removeEventListener("pageshow", handleReturnToPage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      closeChangeChannel();
    }
  };
}

export function getTimerSnapshot(): TimerSnapshot {
  return snapshot;
}

export function getServerTimerSnapshot(): TimerSnapshot {
  return SERVER_SNAPSHOT;
}

export function useTimer(): TimerSnapshot {
  return useSyncExternalStore(
    subscribeToTimer,
    getTimerSnapshot,
    getServerTimerSnapshot,
  );
}

export async function dispatchTimer(action: TimerAction): Promise<void> {
  const now = Date.now();
  const result = await transactTimer(action, now);
  snapshot = { ...result.history, initialized: true, error: null };
  emitChange();

  if (result.changed) {
    openChangeChannel()?.postMessage({ type: "changed" });
  }
  if (result.error) throw result.error;
}
