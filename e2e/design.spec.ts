import { expect, test, type Page } from "@playwright/test";

async function loadLargeTimers(page: Page) {
  const now = new Date(2026, 8, 30, 12).getTime();
  await page.clock.setFixedTime(now);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start Work", exact: true }),
  ).toBeEnabled();
  await page.evaluate(
    (at) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("work-timer", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction("events", "readwrite");
          const store = transaction.objectStore("events");
          store.add({ id: "work", state: "work", at: at - 112 * 3_600_000 });
          store.add({ id: "stop", state: "stopped", at: at - 12 * 3_600_000 });
          store.add({ id: "break", state: "break", at: at - 10 * 3_600_000 });
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
    now,
  );
  await page.reload();
  await expect(page.getByText("Break Session", { exact: true })).toBeVisible();
}

for (const scenario of [
  { width: 320, fontSize: 16, layout: "grid" },
  { width: 320, fontSize: 32, layout: "grid" },
  { width: 1280, fontSize: 16, layout: "grid" },
  { width: 1280, fontSize: 32, layout: "grid" },
]) {
  test(`fits large timers and history at ${scenario.width}px with ${scenario.fontSize}px text`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await loadLargeTimers(page);
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}px`;
    }, scenario.fontSize);
    await expect(
      page.getByRole("button", { name: /^Work Total/ }),
    ).toContainText("100:00:00");
    await expect(page.getByRole("timer")).toHaveAccessibleName(
      /Break Session: 10 hours/,
    );
    const geometry = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      layout: getComputedStyle(document.querySelector(".session-row")!).display,
      overflowingTimers: [
        ...document.querySelectorAll<HTMLElement>(".timer-value"),
      ].filter((el) => el.scrollWidth > el.clientWidth).length,
      targets: [
        ...document.querySelectorAll<HTMLElement>(
          ".duration-edit-button, .timer-actions button",
        ),
      ].map((el) => ({
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
      })),
    }));
    expect(geometry.pageOverflow).toBe(false);
    expect(geometry.overflowingTimers).toBe(0);
    expect(geometry.layout).toBe(scenario.layout);
    await expect(
      page.getByRole("columnheader", { name: "Duration", exact: true }),
    ).toBeVisible();
    for (const target of geometry.targets) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "Edit work session" }).click();
    await page.getByRole("button", { name: "End", exact: true }).click();
    await expect(page.getByLabel("Exact end time")).toBeFocused();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Edit work session" }),
    ).toBeFocused();
  });
}

test("fits longer labels and localized times with large text", async ({
  browser,
}) => {
  const context = await browser.newContext({
    locale: "ar-EG",
    viewport: { width: 375, height: 900 },
  });
  const page = await context.newPage();
  try {
    await loadLargeTimers(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
      document.querySelector(".total-metric > div")!.textContent =
        "Gesamte aufgezeichnete Arbeitszeit";
      document.querySelector(".mode-action")!.textContent =
        "Zurück zur konzentrierten Arbeit";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const locator of [
      page.locator(".total-metric").first(),
      page.locator(".mode-action"),
    ]) {
      expect(
        await locator.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
  } finally {
    await context.close();
  }
});

test("primary and stop controls have readable text contrast", async ({
  page,
}) => {
  await loadLargeTimers(page);
  const ratios = () =>
    page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const luminance = (color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const rgb = [...ctx.getImageData(0, 0, 1, 1).data]
          .slice(0, 3)
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      return [...document.querySelectorAll(".timer-actions button")].map(
        (el) => {
          const style = getComputedStyle(el);
          const text = luminance(style.color);
          const background = luminance(style.backgroundColor);
          return (
            (Math.max(text, background) + 0.05) /
            (Math.min(text, background) + 0.05)
          );
        },
      );
    });
  await expect
    .poll(async () => Math.min(...(await ratios())))
    .toBeGreaterThanOrEqual(4.5);
});
