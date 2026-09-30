import { expect, test, type BrowserContext, type Page } from "@playwright/test";

interface IndexedWorkday {
  dateKey: string;
  events: Array<{ id: string; state: string; at: number }>;
}

async function seedLegacyStorage(
  context: BrowserContext,
  raw: string,
): Promise<void> {
  await context.addInitScript((value) => {
    if (sessionStorage.getItem("work-timer:test-seeded") === "1") return;
    localStorage.setItem("work-timer:v1", value);
    sessionStorage.setItem("work-timer:test-seeded", "1");
  }, raw);
}

async function suppressBroadcastNotifications(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(() => {
    if (typeof BroadcastChannel === "undefined") return;
    BroadcastChannel.prototype.postMessage = () => {};
  });
}

async function readIndexedWorkday(page: Page): Promise<IndexedWorkday> {
  return page.evaluate(
    () =>
      new Promise<IndexedWorkday>((resolve, reject) => {
        const open = indexedDB.open("work-timer", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(
            ["meta", "events"],
            "readonly",
          );
          const meta = transaction.objectStore("meta").get("current");
          const events = transaction.objectStore("events").getAll();
          transaction.oncomplete = () => {
            database.close();
            const result = meta.result as { dateKey: string } | undefined;
            if (!result) {
              reject(new Error("Missing workday metadata"));
              return;
            }
            resolve({
              dateKey: result.dateKey,
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

test("work to break flow creates editable history", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("STOPPED")).toBeVisible();
  await page.getByRole("button", { name: "Start Day" }).click();
  await expect(page.getByText("WORK MODE")).toBeVisible();

  await page.getByRole("button", { name: "Switch to Break" }).click();
  await expect(page.getByText("BREAK MODE")).toBeVisible();

  const table = page.getByRole("table");
  await expect(table.getByText("Work")).toBeVisible();
  await expect(table.getByText(/Break/)).toBeVisible();

  await table.getByRole("button", { name: "Edit" }).nth(1).click();
  await expect(page.getByText("Exact start time")).toBeVisible();
  await expect(page.getByRole("button", { name: "-5 min" })).toBeVisible();
});

test("migrates legacy localStorage once", async ({ context, page }) => {
  const startedAt = Date.now() - 10 * 60_000;
  const date = new Date(startedAt);
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
  await seedLegacyStorage(
    context,
    JSON.stringify({
      version: 1,
      dateKey,
      events: [{ id: "legacy", state: "work", at: startedAt }],
    }),
  );

  await page.goto("/");
  await expect(page.getByText("WORK MODE")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("work-timer:v1")),
  ).toBeNull();
  expect((await readIndexedWorkday(page)).events).toEqual([
    { id: "legacy", state: "work", at: startedAt },
  ]);

  await page.evaluate(() => localStorage.setItem("work-timer:v1", "{broken"));
  await page.reload();
  await expect(page.getByText("WORK MODE")).toBeVisible();
  expect((await readIndexedWorkday(page)).events).toEqual([
    { id: "legacy", state: "work", at: startedAt },
  ]);
  expect(await page.evaluate(() => localStorage.getItem("work-timer:v1"))).toBe(
    "{broken",
  );
});

test("preserves malformed legacy data", async ({ context, page }) => {
  await seedLegacyStorage(context, "{broken");

  await page.goto("/");

  await expect(page.locator("main").getByRole("alert")).toContainText(
    "unreadable",
  );
  await expect(page.getByRole("button", { name: "Start Day" })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("work-timer:v1"))).toBe(
    "{broken",
  );
});

test("deduplicates stale transitions", async ({ context, page }) => {
  await suppressBroadcastNotifications(context);
  await page.goto("/");
  await page.getByRole("button", { name: "Start Day" }).click();
  await expect(page.getByText("WORK MODE")).toBeVisible();

  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText("WORK MODE")).toBeVisible();

  await Promise.all([
    page.getByRole("button", { name: "Switch to Break" }).click(),
    other.getByRole("button", { name: "Switch to Break" }).click(),
  ]);

  await expect(page.getByText("BREAK MODE")).toBeVisible();
  await expect(other.getByText("BREAK MODE")).toBeVisible();
  const stored = await readIndexedWorkday(page);
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
  await page.getByRole("button", { name: "Start Day" }).click();
  await expect(page.getByText("WORK MODE")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText("WORK MODE")).toBeVisible();
  await other.getByRole("button", { name: "Switch to Break" }).click();
  await expect(other.getByText("BREAK MODE")).toBeVisible();
  await expect(page.getByText("WORK MODE")).toBeVisible();
  await page.getByRole("button", { name: "Stop Day" }).click();
  await expect(page.getByText("STOPPED")).toBeVisible();
  expect(
    (await readIndexedWorkday(page)).events.map((event) => event.state),
  ).toEqual(["work", "break", "stopped"]);
});

test("preserves an edit racing a transition", async ({ context, page }) => {
  await suppressBroadcastNotifications(context);
  await page.goto("/");
  await page.getByRole("button", { name: "Start Day" }).click();
  await expect(page.getByText("WORK MODE")).toBeVisible();

  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText("WORK MODE")).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "-1 min", exact: true }).click();
  const editedAt = await page.getByLabel("Exact start time").inputValue();
  const expectedAt = await page.evaluate(
    (value) => new Date(value).getTime(),
    editedAt,
  );

  await Promise.all([
    page.getByRole("button", { name: "Save", exact: true }).click(),
    other.getByRole("button", { name: "Switch to Break" }).click(),
  ]);

  await expect(other.getByText("BREAK MODE")).toBeVisible();
  await expect(page.getByLabel("Exact start time")).not.toBeVisible();
  const stored = await readIndexedWorkday(page);
  expect(stored.events.map((event) => event.state)).toEqual(["work", "break"]);
  expect(stored.events[0].at).toBe(expectedAt);
});

test("rejects stale edit after new boundary", async ({ context, page }) => {
  await suppressBroadcastNotifications(context);
  const startedAt = Date.now() - 10 * 60_000;
  const date = new Date(startedAt);
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
  await seedLegacyStorage(
    context,
    JSON.stringify({
      version: 1,
      dateKey,
      events: [{ id: "legacy", state: "work", at: startedAt }],
    }),
  );

  await page.goto("/");
  await expect(page.getByText("WORK MODE")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText("WORK MODE")).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "+5 min", exact: true }).click();
  await other.evaluate(
    (now) => {
      Date.now = () => now;
    },
    startedAt + 2 * 60_000,
  );
  await other.getByRole("button", { name: "Switch to Break" }).click();
  await expect(other.getByText("BREAK MODE")).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Start time must be before the next boundary."),
  ).toBeVisible();

  const stored = await readIndexedWorkday(page);
  expect(stored.events[0].at).toBe(startedAt);
  expect(stored.events.map((event) => event.state)).toEqual(["work", "break"]);
});

test("preserves editor focus across tabs", async ({ context, page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Day" }).click();
  await expect(page.getByText("WORK MODE")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
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

  await expect(page.getByText("BREAK MODE")).toBeVisible();
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
  await page.getByRole("button", { name: "Start Day" }).click();
  await expect(page.getByText("WORK MODE")).toBeVisible();
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
  await expect(page.getByText("BREAK MODE")).toBeVisible();
  expect(
    (await readIndexedWorkday(page)).events.map((event) => event.state),
  ).toEqual(["work", "break"]);
  expect(navigations).toBe(0);
});

test("rolls back a failed IndexedDB transaction", async ({ page }) => {
  await page.goto("/");
  const start = page.getByRole("button", { name: "Start Day" });
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
  expect((await readIndexedWorkday(page)).events).toEqual([]);

  await page.evaluate(() =>
    (
      window as Window & { restoreIndexedDbAdd?: () => void }
    ).restoreIndexedDbAdd?.(),
  );
  await start.click();
  await expect(page.getByText("WORK MODE")).toBeVisible();
});
