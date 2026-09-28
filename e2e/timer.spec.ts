import { expect, test } from "@playwright/test";

test("work to break flow creates editable session history", async ({ page }) => {
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
