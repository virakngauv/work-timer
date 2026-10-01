import type { TimerEvent, TimerHistory } from "@/lib/timer";
import { applyTimerAction, type TimerAction } from "@/lib/timer-actions";

const DB_NAME = "work-timer";
const DB_VERSION = 1;
const EVENTS_STORE = "events";

export interface TimerTransactionResult {
  history: TimerHistory;
  changed: boolean;
  error: Error | null;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error(
        "This browser cannot save timer data because IndexedDB is unavailable.",
      ),
    );
  }

  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(EVENTS_STORE, { keyPath: "id" });
    };
    request.onerror = () => {
      databasePromise = null;
      reject(new Error("Could not open timer storage."));
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onclose = () => {
        databasePromise = null;
      };
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
  });
  return databasePromise;
}

function sortEvents(events: TimerEvent[]): TimerEvent[] {
  return [...events].sort((left, right) => left.at - right.at);
}

export async function readTimerHistory(): Promise<TimerHistory> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EVENTS_STORE, "readonly");
    const request = transaction.objectStore(EVENTS_STORE).getAll();
    transaction.oncomplete = () =>
      resolve({ events: sortEvents(request.result as TimerEvent[]) });
    transaction.onabort = () =>
      reject(new Error("Could not read timer storage."));
    transaction.onerror = () =>
      reject(new Error("Could not read timer storage."));
  });
}

export async function transactTimer(
  action: TimerAction,
  now: number,
): Promise<TimerTransactionResult> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EVENTS_STORE, "readwrite");
    const store = transaction.objectStore(EVENTS_STORE);
    const request = store.getAll();
    let outcome: TimerTransactionResult | null = null;
    let failure: Error | null = null;

    request.onsuccess = () => {
      const latest: TimerHistory = {
        events: sortEvents(request.result as TimerEvent[]),
      };
      let applied;
      try {
        applied = applyTimerAction(latest, action, now);
      } catch (error) {
        outcome = {
          history: latest,
          changed: false,
          error:
            error instanceof Error
              ? error
              : new Error("Could not update the timer."),
        };
        return;
      }
      try {
        switch (applied.mutation.type) {
          case "clear":
            store.clear();
            break;
          case "none":
            break;
          case "append":
            store.add(applied.mutation.event);
            break;
          case "edit":
            store.put(applied.mutation.event);
            break;
        }
      } catch {
        failure = new Error(
          "Could not save timer data. The change was not applied.",
        );
        transaction.abort();
        return;
      }
      outcome = {
        history: applied.history,
        changed: applied.mutation.type !== "none",
        error: null,
      };
    };
    transaction.oncomplete = () => {
      if (!outcome) {
        reject(new Error("Could not update the timer."));
        return;
      }
      resolve(outcome);
    };
    transaction.onabort = () =>
      reject(
        failure ??
          new Error("Could not save timer data. The change was not applied."),
      );
  });
}
