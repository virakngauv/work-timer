import type { TimerEvent } from "@/lib/timer";
import {
  localDateKey,
  readLegacyWorkday,
  STORAGE_KEY,
  type PersistedWorkday,
} from "@/lib/storage";
import {
  applyWorkdayAction,
  visibleWorkday,
  type WorkdayAction,
} from "@/lib/workday-actions";

const DB_NAME = "work-timer";
const DB_VERSION = 1;
const META_STORE = "meta";
const EVENTS_STORE = "events";
const META_KEY = "current";

interface WorkdayMeta {
  key: typeof META_KEY;
  dateKey: string;
}

export interface WorkdayTransactionResult {
  workday: PersistedWorkday;
  changed: boolean;
  error: Error | null;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function databaseError(message: string): Error {
  return new Error(message);
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      databaseError(
        "This browser cannot save timer data because IndexedDB is unavailable.",
      ),
    );
  }

  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(EVENTS_STORE)) {
        database.createObjectStore(EVENTS_STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => {
      databasePromise = null;
      reject(databaseError("Could not open timer storage."));
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
  });

  return databasePromise;
}

function initializeDatabase(database: IDBDatabase, now: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [META_STORE, EVENTS_STORE],
      "readwrite",
    );
    const metaStore = transaction.objectStore(META_STORE);
    const eventsStore = transaction.objectStore(EVENTS_STORE);
    let failure: Error | null = null;
    let migratedLegacy = false;

    const metaRequest = metaStore.get(META_KEY);
    metaRequest.onsuccess = () => {
      if (metaRequest.result) return;

      let initial: PersistedWorkday;
      try {
        const legacy = readLegacyWorkday();
        migratedLegacy = legacy !== null;
        initial = legacy ?? { dateKey: localDateKey(now), events: [] };
      } catch (error) {
        failure =
          error instanceof Error
            ? error
            : databaseError("Could not migrate existing timer data.");
        transaction.abort();
        return;
      }

      try {
        metaStore.put({
          key: META_KEY,
          dateKey: initial.dateKey,
        } satisfies WorkdayMeta);
        for (const event of initial.events) eventsStore.add(event);
      } catch {
        failure = databaseError(
          "Could not migrate existing timer data. The original data was left unchanged.",
        );
        transaction.abort();
      }
    };

    transaction.oncomplete = () => {
      if (migratedLegacy) {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // IndexedDB is initialized, so a leftover legacy copy is harmless.
        }
      }
      resolve();
    };
    transaction.onabort = () => {
      reject(
        failure ??
          databaseError(
            "Could not initialize timer storage. The existing data was left unchanged.",
          ),
      );
    };
  });
}

async function readyDatabase(now: number): Promise<IDBDatabase> {
  const database = await openDatabase();
  await initializeDatabase(database, now);
  return database;
}

function sortEvents(events: TimerEvent[]): TimerEvent[] {
  return [...events].sort((left, right) => left.at - right.at);
}

function readStoredWorkday(database: IDBDatabase): Promise<PersistedWorkday> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [META_STORE, EVENTS_STORE],
      "readonly",
    );
    const metaRequest = transaction
      .objectStore(META_STORE)
      .get(META_KEY);
    const eventsRequest = transaction.objectStore(EVENTS_STORE).getAll();

    transaction.oncomplete = () => {
      const meta = metaRequest.result as WorkdayMeta | undefined;
      if (!meta) {
        reject(databaseError("Timer storage is not initialized."));
        return;
      }
      resolve({
        dateKey: meta.dateKey,
        events: sortEvents(eventsRequest.result as TimerEvent[]),
      });
    };
    transaction.onabort = () =>
      reject(databaseError("Could not read timer storage."));
    transaction.onerror = () =>
      reject(databaseError("Could not read timer storage."));
  });
}

export async function readWorkday(): Promise<PersistedWorkday> {
  const now = Date.now();
  const database = await readyDatabase(now);
  return visibleWorkday(await readStoredWorkday(database), now);
}

export async function transactWorkday(
  action: WorkdayAction,
  now: number,
): Promise<WorkdayTransactionResult> {
  const database = await readyDatabase(now);

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [META_STORE, EVENTS_STORE],
      "readwrite",
    );
    const metaStore = transaction.objectStore(META_STORE);
    const eventsStore = transaction.objectStore(EVENTS_STORE);
    const metaRequest = metaStore.get(META_KEY);
    const eventsRequest = eventsStore.getAll();
    let metaReady = false;
    let eventsReady = false;
    let outcome: WorkdayTransactionResult | null = null;
    let failure: Error | null = null;

    const apply = () => {
      if (!metaReady || !eventsReady || outcome || failure) return;
      const meta = metaRequest.result as WorkdayMeta | undefined;
      if (!meta) {
        failure = databaseError("Timer storage is not initialized.");
        transaction.abort();
        return;
      }

      const latest: PersistedWorkday = {
        dateKey: meta.dateKey,
        events: sortEvents(eventsRequest.result as TimerEvent[]),
      };

      let applied;
      try {
        applied = applyWorkdayAction(latest, action, now);
      } catch (error) {
        outcome = {
          workday: visibleWorkday(latest, now),
          changed: false,
          error:
            error instanceof Error
              ? error
              : databaseError("Could not update the timer."),
        };
        return;
      }

      try {
        switch (applied.mutation.type) {
          case "none":
            break;
          case "append":
            eventsStore.add(applied.mutation.event);
            break;
          case "edit":
            eventsStore.put(applied.mutation.event);
            break;
          case "reset":
            eventsStore.clear();
            metaStore.put({
              key: META_KEY,
              dateKey: applied.mutation.dateKey,
            } satisfies WorkdayMeta);
            for (const event of applied.mutation.events) {
              eventsStore.add(event);
            }
            break;
        }
      } catch {
        failure = databaseError(
          "Could not save timer data. The change was not applied.",
        );
        transaction.abort();
        return;
      }

      outcome = {
        workday: visibleWorkday(applied.workday, now),
        changed: applied.mutation.type !== "none",
        error: null,
      };
    };

    metaRequest.onsuccess = () => {
      metaReady = true;
      apply();
    };
    eventsRequest.onsuccess = () => {
      eventsReady = true;
      apply();
    };

    transaction.oncomplete = () => {
      if (!outcome) {
        reject(databaseError("Could not update the timer."));
        return;
      }
      resolve(outcome);
    };
    transaction.onabort = () => {
      reject(
        failure ??
          databaseError(
            "Could not save timer data. The change was not applied.",
          ),
      );
    };
  });
}
