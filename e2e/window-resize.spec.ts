import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/app";

async function dragCorner(page: Page, handle: Locator, dx: number, dy: number) {
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

test("grows the app from the inner player without coupling the two handles", async ({
  app,
  ready: page,
}) => {
  const resizeApp = (width: number, height: number) =>
    app.evaluate(
      ({ BrowserWindow }, size) =>
        BrowserWindow.getAllWindows()[0].setContentSize(
          size.width,
          size.height,
        ),
      { width, height },
    );
  const viewport = () =>
    page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const panel = page.locator('[data-presentation="modal"]');
  const outer = page.getByRole("button", {
    name: "Resize window",
    exact: true,
  });
  const inner = panel.locator('[data-resize-edge="corner"]');

  await resizeApp(900, 600);
  await expect.poll(async () => (await viewport()).width).toBe(900);
  await page.evaluate(() => {
    // A larger frame saved before the user opened this smaller window.
    localStorage.setItem(
      "meguri.media.detail.dimensions.v1",
      JSON.stringify({ width: 1100, height: 760, left: 16, top: 16 }),
    );
  });
  await page.getByTitle("test.png", { exact: true }).click();
  await expect(inner).toBeVisible();
  const player = (await panel.boundingBox())!;

  await dragCorner(page, outer, 90, 75);
  await expect.poll(async () => (await viewport()).width).toBeGreaterThan(900);
  expect(await panel.boundingBox()).toEqual(player);

  const largerApp = await viewport();
  await dragCorner(page, inner, 180, 150);
  await expect
    .poll(async () => (await viewport()).width)
    .toBeGreaterThan(largerApp.width);
  await expect
    .poll(async () => (await viewport()).height)
    .toBeGreaterThan(largerApp.height);
  await expect
    .poll(async () => (await panel.boundingBox())!.width)
    .toBeGreaterThan(player.width + 150);
  const grownApp = await viewport();
  const grownPlayer = (await panel.boundingBox())!;
  expect(grownPlayer.x + grownPlayer.width).toBeLessThanOrEqual(grownApp.width);
  expect(grownPlayer.y + grownPlayer.height).toBeLessThanOrEqual(
    grownApp.height,
  );

  await dragCorner(page, inner, -70, -60);
  await expect
    .poll(async () => (await panel.boundingBox())!.width)
    .toBeLessThan(grownPlayer.width);
  expect(await viewport()).toEqual(grownApp);

  await resizeApp(850, 560);
  await expect
    .poll(async () => (await panel.boundingBox())!.width)
    .toBeLessThan(850);
  const fitted = await panel.boundingBox();
  await dragCorner(page, outer, 100, 80);
  await expect.poll(async () => (await viewport()).width).toBeGreaterThan(850);
  expect(await panel.boundingBox()).toEqual(fitted);

  await page
    .getByRole("button", { name: "Enlarge modal", exact: true })
    .click();
  await expect.poll(async () => (await viewport()).width).toBeGreaterThan(1000);
  await resizeApp(900, 620);
  await expect
    .poll(async () => (await panel.boundingBox())!.width)
    .toBeLessThan(900);
  const fittedExpanded = await panel.boundingBox();
  await dragCorner(page, outer, 80, 60);
  await expect.poll(async () => (await viewport()).width).toBeGreaterThan(900);
  expect(await panel.boundingBox()).toEqual(fittedExpanded);
});
