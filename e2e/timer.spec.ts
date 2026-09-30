import { expect, test } from "@playwright/test";

test("work to break flow creates editable session history", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

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

test("simultaneous stale-tab requests serialize without duplicate transitions", async ({
  context,
  page,
}) => {
  // Delay notifications deliberately so both buttons act from the same old view.
  await context.addInitScript(() => {
    const add = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, ...args: unknown[]) => {
      if (type !== "storage") Reflect.apply(add, window, [type, ...args]);
    }) as typeof window.addEventListener;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start Day" }).click();
  await expect(page.getByText("WORK MODE")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByText("WORK MODE")).toBeVisible();

  // Hold the real browser lock until both UI actions have queued behind it.
  await page.evaluate(() => {
    void navigator.locks.request(
      "work-timer:write",
      () =>
        new Promise<void>((resolve) => {
          (
            window as Window & { releaseWriteLock?: () => void }
          ).releaseWriteLock = resolve;
        }),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.locks.query()).held?.length),
    )
    .toBe(1);
  await Promise.all([
    page.getByRole("button", { name: "Switch to Break" }).click(),
    other.getByRole("button", { name: "Switch to Break" }).click(),
  ]);
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await navigator.locks.query()).pending?.length,
      ),
    )
    .toBe(2);
  await page.evaluate(() =>
    (window as Window & { releaseWriteLock?: () => void }).releaseWriteLock?.(),
  );
  await expect(page.getByText("BREAK MODE")).toBeVisible();
  await expect(other.getByText("BREAK MODE")).toBeVisible();
  const events = await page.evaluate(
    () => JSON.parse(localStorage.getItem("work-timer:v1")!).events,
  );
  expect(events.map((event: { state: string }) => event.state)).toEqual([
    "work",
    "break",
  ]);
  expect(events[1].at).toBeGreaterThan(events[0].at);
});

test("cross-tab data updates preserve the open editor without navigation", async ({
  context,
  page,
}) => {
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

test("a boundary edit and another tab's transition both persist", async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    const add = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, ...args: unknown[]) => {
      if (type !== "storage") Reflect.apply(add, window, [type, ...args]);
    }) as typeof window.addEventListener;
  });
  await page.goto("/");
  await page.evaluate(() => {
    const now = new Date();
    localStorage.setItem(
      "work-timer:v1",
      JSON.stringify({
        version: 1,
        dateKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        events: [{ id: "seed", state: "work", at: Date.now() - 600_000 }],
      }),
    );
  });
  await page.reload();
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

  await page.evaluate(() => {
    void navigator.locks.request(
      "work-timer:write",
      () =>
        new Promise<void>((resolve) => {
          (
            window as Window & { releaseWriteLock?: () => void }
          ).releaseWriteLock = resolve;
        }),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.locks.query()).held?.length),
    )
    .toBe(1);
  await Promise.all([
    page.getByRole("button", { name: "Save", exact: true }).click(),
    other.getByRole("button", { name: "Switch to Break" }).click(),
  ]);
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await navigator.locks.query()).pending?.length,
      ),
    )
    .toBe(2);
  await page.evaluate(() =>
    (window as Window & { releaseWriteLock?: () => void }).releaseWriteLock?.(),
  );
  await expect(page.getByLabel("Exact start time")).not.toBeVisible();
  await expect(other.getByText("BREAK MODE")).toBeVisible();
  const events = await page.evaluate(
    () => JSON.parse(localStorage.getItem("work-timer:v1")!).events,
  );
  expect(events.map((event: { state: string }) => event.state)).toEqual([
    "work",
    "break",
  ]);
  expect(events[0].at).toBe(expectedAt);
});
