import { expect, test } from "@playwright/test";

test("declares static clock icons and serves real image assets", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const icons = page.locator('head link[rel="icon"]');
  await expect(icons).toHaveCount(2);
  const svg = page.locator('head link[rel="icon"][type="image/svg+xml"]');
  await expect(svg).toHaveAttribute("sizes", "any");
  const apple = page.locator('head link[rel="apple-touch-icon"]');
  await expect(apple).toHaveCount(1);
  await expect(apple).toHaveAttribute("sizes", "180x180");

  const favicon = await request.get("/favicon.ico");
  expect(favicon.ok()).toBeTruthy();
  expect(favicon.headers()["content-type"]).toMatch(
    /^image\/(x-icon|vnd.microsoft.icon)/,
  );
  const ico = await favicon.body();
  expect(ico.readUInt16LE(0)).toBe(0);
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(2);
  for (const [index, size] of [16, 32].entries()) {
    const entry = 6 + index * 16;
    expect([ico[entry], ico[entry + 1]]).toEqual([size, size]);
    const offset = ico.readUInt32LE(entry + 12);
    const length = ico.readUInt32LE(entry + 8);
    expect(offset + length).toBeLessThanOrEqual(ico.length);
    expect(ico.subarray(offset, offset + 8).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );
    expect(ico.readUInt32BE(offset + 16)).toBe(size);
    expect(ico.readUInt32BE(offset + 20)).toBe(size);
  }
  const svgUrl = (await svg.getAttribute("href"))!;
  const svgResponse = await request.get(svgUrl);
  expect(svgResponse.ok()).toBeTruthy();
  expect(svgResponse.headers()["content-type"]).toMatch(/^image\/svg\+xml/);
  expect(await svgResponse.text()).toContain("<svg");

  const appleResponse = await request.get((await apple.getAttribute("href"))!);
  expect(appleResponse.ok()).toBeTruthy();
  expect(appleResponse.headers()["content-type"]).toMatch(/^image\/png/);
  const png = await appleResponse.body();
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);

  await page.getByRole("button", { name: "Start Work", exact: true }).click();
  await page
    .getByRole("button", { name: "Switch to Break", exact: true })
    .click();
  await expect(svg).toHaveAttribute("href", svgUrl);
});
