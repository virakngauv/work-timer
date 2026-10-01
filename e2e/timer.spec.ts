import { expect, test, type BrowserContext, type Page } from "@playwright/test";

interface IndexedHistory {
  events: Array<{ id: string; state: string; at: number }>;
}

async function seedTimerEvents(
  page: Page,
  events: IndexedHistory["events"],
): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start Work", exact: true }),
  ).toBeEnabled();
  await page.evaluate(
    (initialEvents) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("work-timer", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("events", "readwrite");
          for (const event of initialEvents)
            transaction.objectStore("events").add(event);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    events,
  );
  await page.reload();
}

async function suppressBroadcastNotifications(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(() => {
    if (typeof BroadcastChannel === "undefined") return;
    BroadcastChannel.prototype.postMessage = () => {};
  });
}

async function readIndexedHistory(page: Page): Promise<IndexedHistory> {
  return page.evaluate(
    () =>
      new Promise<IndexedHistory>((resolve, reject) => {
        const open = indexedDB.open("work-timer", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction("events", "readonly");
          const events = transaction.objectStore("events").getAll();
          transaction.oncomplete = () => {
            database.close();
            resolve({
              events: (
                events.result as Array<{
                  id: string;
                  state: string;
                  at: number;
                }>
              ).sort((left, right) => left.at - right.at),
            });
          };
          transaction.onabort = () => reject(transaction.error);
        };
      }),
  );
}

for (const control of ["Start Break", /^Break Total/]) {
  test(`starts and resumes a break using ${control}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    for (const mode of ["Work", "Break"]) {
      const total = await page
        .getByRole("button", { name: new RegExp(`^${mode} Total`) })
        .boundingBox();
      const start = await page
        .getByRole("button", { name: `Start ${mode}`, exact: true })
        .boundingBox();
      expect(total).not.toBeNull();
      expect(start).not.toBeNull();
      expect(start!.x).toBeCloseTo(total!.x, 1);
      expect(start!.width).toBeCloseTo(total!.width, 1);
    }
    await page
      .getByRole("button", {
        name: control,
        exact: typeof control === "string",
      })
      .click();
    await expect(page.getByText("Break Session")).toBeVisible();
    expect(
      (await readIndexedHistory(page)).events.map((event) => event.state),
    ).toEqual(["break"]);

    await page.reload();
    await expect(page.getByText("Break Session")).toBeVisible();
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await page
      .getByRole("button", {
        name: control,
        exact: typeof control === "string",
      })
      .click();
    await expect(page.getByText("Break Session")).toBeVisible();
    const events = (await readIndexedHistory(page)).events;
    expect(events.map((event) => event.state)).toEqual([
      "break",
      "stopped",
      "break",
    ]);
    expect(events[1].at).toBeGreaterThan(events[0].at);
    expect(events[2].at).toBeGreaterThan(events[1].at);
  });
}

test("work to break flow creates editable history", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Total time", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start Work", exact: true }).click();
  await expect(page.getByText("Work Session")).toBeVisible();

  await page.getByRole("button", { name: "Switch to Break" }).click();
  await expect(page.getByText("Break Session")).toBeVisible();

  const table = page.getByRole("table");
  await expect(table.getByText("Work")).toBeVisible();
  await expect(table.getByText(/Break/)).toBeVisible();

  const rows = table.locator("tbody > tr");
  await expect(rows.nth(0)).toContainText("Break");
  await expect(rows.nth(1)).toContainText("Work");
  await table
    .getByRole("button", { name: /^Edit .* session / })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Edit break session" }),
  ).toBeVisible();
  await expect(page.getByText("Exact start time")).toBeVisible();
  await expect(page.getByRole("button", { name: "-5 min" })).toBeVisible();
});

test("retains stopped history across midnight and later starts", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(2026, 8, 29, 23, 50));
  await page.goto("/");
  await page.getByRole("button", { name: "Start Work", exact: true }).click();
  await page.clock.setFixedTime(new Date(2026, 8, 29, 23, 55));
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const initial = (await readIndexedHistory(page)).events;

  await page.clock.setFixedTime(new Date(2026, 8, 30, 0, 5));
  await page.reload();
  await expect(page.getByRole("button", { name: /^Work Total/ })).toContainText(
    "00:05:00",
  );
  await expect(page.getByRole("table").locator("tbody > tr")).toHaveCount(2);
  expect((await readIndexedHistory(page)).events).toEqual(initial);

  await page.getByRole("button", { name: "Start Break", exact: true }).click();
  await page.clock.setFixedTime(new Date(2026, 8, 30, 0, 10));
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Break Total/ }),
  ).toContainText("00:05:00");
  await expect(page.getByRole("table").locator("tbody > tr")).toHaveCount(4);
  const stored = await readIndexedHistory(page);
  expect(stored.events.slice(0, 2)).toEqual(initial);
  expect(stored.events.map((event) => event.state)).toEqual([
    "work",
    "stopped",
    "break",
    "stopped",
  ]);
});

test("retains an active session across midnight and reload", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(2026, 8, 29, 23, 50));
  await page.goto("/");
  await page.getByRole("button", { name: "Start Work", exact: true }).click();
  const initial = (await readIndexedHistory(page)).events;
  await page.clock.setFixedTime(new Date(2026, 8, 30, 0, 10));
  await page.reload();
  await expect(page.getByText("Work Session")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Work Total/ })).toContainText(
    "00:20:00",
  );
  expect((await readIndexedHistory(page)).events).toEqual(initial);
  await page
    .getByRole("button", { name: "Switch to Break", exact: true })
    .click();
  expect((await readIndexedHistory(page)).events[0]).toEqual(initial[0]);
});

test("deduplicates stale transitions", async ({ context, page }) => {
  await suppressBroadcastNotifications(context);
  await page.goto("/");
  await page.getByRole("button", { name: "Start Work", exact: true }).click();
  await expect(page.getByText("Work Session")).toBeVisible();

  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText("Work Session")).toBeVisible();

  await Promise.all([
    page.getByRole("button", { name: "Switch to Break" }).click(),
    other.getByRole("button", { name: "Switch to Break" }).click(),
  ]);

  await expect(page.getByText("Break Session")).toBeVisible();
  await expect(other.getByText("Break Session")).toBeVisible();
  const stored = await readIndexedHistory(page);
  expect(stored.events.map((event) => event.state)).toEqual(["work", "break"]);
  expect(stored.events[1].at).toBeGreaterThan(stored.events[0].at);
});

test("stops the latest mode when another tab has switched", async ({
  context,
  page,
}) => {
  await suppressBroadcastNotifications(context);
  await context.addInitScript(() => {
    const original = window.addEventListener;
    window.addEventListener = function (...args: Parameters<typeof original>) {
      if (args[0] === "focus") return;
      return original.apply(this, args);
    };
    const originalDocument = document.addEventListener;
    document.addEventListener = function (
      ...args: Parameters<typeof originalDocument>
    ) {
      if (args[0] === "visibilitychange") return;
      return originalDocument.apply(this, args);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start Work", exact: true }).click();
  await expect(page.getByText("Work Session")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText("Work Session")).toBeVisible();
  await other.getByRole("button", { name: "Switch to Break" }).click();
  await expect(other.getByText("Break Session")).toBeVisible();
  await expect(page.getByText("Work Session")).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Total time", { exact: true })).toBeVisible();
  expect(
    (await readIndexedHistory(page)).events.map((event) => event.state),
  ).toEqual(["work", "break", "stopped"]);
});

test("preserves an edit racing a transition", async ({ context, page }) => {
  await suppressBroadcastNotifications(context);
  await page.goto("/");
  await page.getByRole("button", { name: "Start Work", exact: true }).click();
  await expect(page.getByText("Work Session")).toBeVisible();

  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText("Work Session")).toBeVisible();

  await page.getByRole("button", { name: /^Edit .* session / }).click();
  await page.getByRole("button", { name: "-1 min", exact: true }).click();
  const originalAt = (await readIndexedHistory(page)).events[0].at;
  const editedAt = await page.getByLabel("Exact start time").inputValue();
  const expectedAt = await page.evaluate(
    (value) => new Date(value).getTime(),
    editedAt,
  );

  await Promise.all([
    page.getByRole("button", { name: "Save", exact: true }).click(),
    other.getByRole("button", { name: "Switch to Break" }).click(),
  ]);

  await expect(other.getByText("Break Session")).toBeVisible();
  await expect(page.getByLabel("Exact start time")).not.toBeVisible();
  const stored = await readIndexedHistory(page);
  expect(stored.events.map((event) => event.state)).toEqual(["work", "break"]);
  expect(stored.events[0].at).toBe(expectedAt + (originalAt % 1000));
});

test("rejects stale edit after new boundary", async ({ context, page }) => {
  await suppressBroadcastNotifications(context);
  const startedAt = Date.now() - 10 * 60_000;
  await seedTimerEvents(page, [{ id: "start", state: "work", at: startedAt }]);
  await expect(page.getByText("Work Session")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText("Work Session")).toBeVisible();

  await page.getByRole("button", { name: /^Edit .* session / }).click();
  await page.getByRole("button", { name: "+5 min", exact: true }).click();
  await other.evaluate(
    (now) => {
      Date.now = () => now;
    },
    startedAt + 2 * 60_000,
  );
  await other.getByRole("button", { name: "Switch to Break" }).click();
  await expect(other.getByText("Break Session")).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Start time must be before the next boundary."),
  ).toBeVisible();

  const stored = await readIndexedHistory(page);
  expect(stored.events[0].at).toBe(startedAt);
  expect(stored.events.map((event) => event.state)).toEqual(["work", "break"]);
});

test("preserves editor focus across tabs", async ({ context, page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Work", exact: true }).click();
  await expect(page.getByText("Work Session")).toBeVisible();
  await page.getByRole("button", { name: /^Edit .* session / }).click();
  const input = page.getByLabel("Exact start time");
  await input.focus();
  const draft = await input.inputValue();
  let navigations = 0;
  page.on("framenavigated", () => {
    navigations += 1;
  });

  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Switch to Break" }).click();

  await expect(page.getByText("Break Session")).toBeVisible();
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(draft);
  expect(navigations).toBe(0);
});

test("reopens unexpectedly closed storage without reloading", async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      const request = original.apply(this, args);
      if (args[0] === "work-timer") {
        request.addEventListener("success", () => {
          const state = window as Window & { timerDatabase?: IDBDatabase };
          state.timerDatabase ??= request.result;
        });
      }
      return request;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start Work", exact: true }).click();
  await expect(page.getByText("Work Session")).toBeVisible();
  let navigations = 0;
  page.on("framenavigated", () => {
    navigations += 1;
  });
  await page.evaluate(() => {
    const database = (window as Window & { timerDatabase?: IDBDatabase })
      .timerDatabase;
    if (!database) throw new Error("Missing app database connection");
    database.close();
    // Explicit close does not emit this event; simulate the browser's forced-close notification.
    database.dispatchEvent(new Event("close"));
  });
  await page.getByRole("button", { name: "Switch to Break" }).click();
  await expect(page.getByText("Break Session")).toBeVisible();
  expect(
    (await readIndexedHistory(page)).events.map((event) => event.state),
  ).toEqual(["work", "break"]);
  expect(navigations).toBe(0);
});

test("rolls back a failed IndexedDB transaction", async ({ page }) => {
  await page.goto("/");
  const start = page.getByRole("button", { name: "Start Work", exact: true });
  await expect(start).toBeEnabled();

  await page.evaluate(() => {
    const prototype = IDBObjectStore.prototype;
    const original = prototype.add;
    (
      window as Window & { restoreIndexedDbAdd?: () => void }
    ).restoreIndexedDbAdd = () => {
      prototype.add = original;
    };
    prototype.add = function () {
      throw new DOMException("forced failure", "QuotaExceededError");
    };
  });

  await start.click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "Could not save timer data. The change was not applied.",
  );
  expect((await readIndexedHistory(page)).events).toEqual([]);

  await page.evaluate(() =>
    (
      window as Window & { restoreIndexedDbAdd?: () => void }
    ).restoreIndexedDbAdd?.(),
  );
  await start.click();
  await expect(page.getByText("Work Session")).toBeVisible();
});

test("clearing timers requires confirmation and can be dismissed safely", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 850 });
  const now = Date.now();
  await seedTimerEvents(page, [
    { id: "work", state: "work", at: now - 20 * 60_000 },
    { id: "break", state: "break", at: now - 10 * 60_000 },
  ]);
  await expect(
    page.getByRole("button", { name: "Clear timers", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const original = await readIndexedHistory(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText("Total time", { exact: true })).toBeVisible();
  const trigger = page.getByRole("button", {
    name: "Clear timers",
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: "Clear all timers?" });
  await trigger.click();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.mouse.click(4, 4);
  await expect(dialog).not.toBeVisible();
  expect(await readIndexedHistory(page)).toEqual(original);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
  expect(await readIndexedHistory(page)).toEqual(original);
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(await readIndexedHistory(page)).toEqual(original);
  await trigger.click();
  await dialog.getByRole("button", { name: "Clear timers" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start Work", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText("No sessions yet. Start work or a break to begin."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Work Total/ })).toContainText(
    "00:00:00",
  );
  await expect(
    page.getByRole("button", { name: /^Break Total/ }),
  ).toContainText("00:00:00");
  expect((await readIndexedHistory(page)).events).toEqual([]);
  await expect(
    other.getByText("No sessions yet. Start work or a break to begin."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("No sessions yet. Start work or a break to begin."),
  ).toBeVisible();
});

test("a stale clear confirmation cannot erase a newly running timer", async ({
  page,
  context,
}) => {
  const now = Date.now();
  await seedTimerEvents(page, [
    { id: "work", state: "work", at: now - 60_000 },
    { id: "stop", state: "stopped", at: now - 30_000 },
  ]);
  await page.getByRole("button", { name: "Clear timers", exact: true }).click();
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Start Work", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Clear all timers?" });
  await dialog.getByRole("button", { name: "Clear timers" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Stop the timer before clearing it.",
  );
  expect((await readIndexedHistory(page)).events).toHaveLength(3);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("region", { name: "Timer", exact: true }),
  ).toBeFocused();
});

test("a failed clear preserves history and keeps the warning open", async ({
  page,
}) => {
  const now = Date.now();
  await seedTimerEvents(page, [
    { id: "work", state: "work", at: now - 60_000 },
    { id: "stop", state: "stopped", at: now - 30_000 },
  ]);
  const original = await readIndexedHistory(page);
  await page.evaluate(() => {
    IDBObjectStore.prototype.clear = () => {
      throw new Error("Simulated storage failure");
    };
  });
  await page.getByRole("button", { name: "Clear timers", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Clear all timers?" });
  await dialog.getByRole("button", { name: "Clear timers" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "The change was not applied",
  );
  expect(await readIndexedHistory(page)).toEqual(original);
});

test("closes an editor when its session is cleared in another tab", async ({
  page,
  context,
}) => {
  const now = Date.now();
  await seedTimerEvents(page, [
    { id: "work", state: "work", at: now - 60_000 },
    { id: "stop", state: "stopped", at: now - 30_000 },
  ]);
  await page.getByRole("button", { name: /^Edit work session/ }).click();
  await page.getByRole("button", { name: "End", exact: true }).click();
  const other = await context.newPage();
  await other.goto("/");
  await other
    .getByRole("button", { name: "Clear timers", exact: true })
    .click();
  await other
    .getByRole("dialog")
    .getByRole("button", { name: "Clear timers" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("region", { name: "Sessions", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Start Work", exact: true }),
  ).toBeEnabled();
});
