import { _electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpegPath as ffmpeg } from "@zabuton-app/ffmpeg-binaries";
import { electronLaunchOptions } from "../scripts/electron-launch.cjs";
import {
  openDiscover,
  skipFirstLaunchTour,
  waitForIdle,
} from "./fixtures/helpers";

test("keeps Discovery scene seeks local and opens the selected scene without replacing saved progress", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "meguri-discovery-seek-"));
  const root = path.join(temp, "media");
  fs.mkdirSync(root);
  const name = "Scene seek fixture.mkv";
  execFileSync(ffmpeg!, [
    "-v",
    "error",
    "-nostdin",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=duration=60:size=320x180:rate=4",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    path.join(root, name),
  ]);
  const options = electronLaunchOptions({
    args: [`--user-data-dir=${path.join(temp, "profile")}`],
    env: { MEGURI_DISABLE_TRAY: "1", MEGURI_ROOT: root },
  });
  const packaged = process.env.MEGURI_TEST_APP;
  const app = await _electron.launch(
    packaged
      ? { ...options, executablePath: packaged, args: options.args.slice(1) }
      : options,
  );
  try {
    const page = await app.firstWindow();
    await skipFirstLaunchTour(page);
    await waitForIdle(page);
    await expect(page.getByTitle(name, { exact: true }).first()).toBeVisible();
    const dialog = await openDiscover(page);
    const shrink = dialog.getByRole("button", { name: "Shrink modal" });
    if (await shrink.count()) await shrink.click();
    const enlarge = dialog.getByRole("button", { name: "Enlarge modal" });
    await expect(enlarge).toBeVisible();

    const open = dialog.getByRole("link", { name: "Open", exact: true });
    const openHref = (await open.getAttribute("href")) ?? "";
    const id = Number(openHref.match(/\/file\/(\d+)/)?.[1]);
    const workspaceId = new URLSearchParams(openHref.split("?")[1]).get("ws");
    expect(Number.isSafeInteger(id) && workspaceId).toBeTruthy();
    expect(new URLSearchParams(openHref.split("?")[1]).has("t")).toBe(false);
    type AppWindow = {
      api: { invoke: (channel: string, args: unknown) => Promise<unknown> };
    };
    const target = { id, workspaceId };
    const savedAt = 18;
    await page.evaluate(
      ({ target, savedAt }) =>
        (window as unknown as AppWindow).api.invoke("file_save_position", {
          ...target,
          position: savedAt,
          duration: 60,
          urgent: true,
        }),
      { target, savedAt },
    );
    const readResume = () =>
      page.evaluate(async (target) => {
        const file = await (window as unknown as AppWindow).api.invoke(
          "file_get",
          target,
        );
        return (file as { resumePosition: number | null }).resumePosition;
      }, target);
    await expect.poll(readResume).toBe(savedAt);

    const scenes = dialog.getByRole("button", { name: /^Seek to / });
    const video = dialog.locator("video");
    const at = async () =>
      video.evaluate((el: HTMLVideoElement) =>
        el.src && el.readyState > 0
          ? el.currentTime + Number(new URL(el.src).searchParams.get("t"))
          : -1,
      );
    const paused = () => video.evaluate((el: HTMLVideoElement) => el.paused);

    await scenes.first().click();
    await expect(page).toHaveURL(/#\/discover/);
    await expect(enlarge).toBeVisible();
    await expect.poll(at).toBeGreaterThanOrEqual(1.5);
    await expect.poll(paused).toBe(true);

    await dialog.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(paused).toBe(false);
    await scenes.nth(2).click();
    await expect(page).toHaveURL(/#\/discover/);
    await expect(enlarge).toBeVisible();
    await expect.poll(at).toBeGreaterThanOrEqual(11.5);
    await expect.poll(paused).toBe(false);
    await dialog.getByRole("button", { name: "Pause", exact: true }).click();
    await expect.poll(paused).toBe(true);
    await expect.poll(readResume).toBe(savedAt);

    const href = (await open.getAttribute("href")) ?? "";
    const sceneParam = new URLSearchParams(href.split("?")[1]).get("t");
    expect(sceneParam).not.toBeNull();
    const scene = Number(sceneParam);
    expect(scene).toBeGreaterThanOrEqual(11.5);
    expect(scene).not.toBe(savedAt);
    await open.click();
    await expect(page).toHaveURL(/#\/file\//);
    expect(
      new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get("t"),
    ).toBe(sceneParam);
    await expect
      .poll(async () => {
        const position = await at();
        return position >= scene - 0.2 && position < scene + 3;
      })
      .toBe(true);
  } finally {
    await app.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("browses the entire film in Discovery and commits only an explicit timeline seek", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "meguri-film-scrub-"));
  const root = path.join(temp, "media");
  fs.mkdirSync(root);
  const name = "Timeline Film (2026) (1080p WEB-DL).mp4";
  execFileSync(ffmpeg!, [
    "-v",
    "error",
    "-nostdin",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=duration=8700:size=96x54:rate=1",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-g",
    "12",
    path.join(root, name),
  ]);
  const options = electronLaunchOptions({
    args: [`--user-data-dir=${path.join(temp, "profile")}`],
    env: { MEGURI_DISABLE_TRAY: "1", MEGURI_ROOT: root },
  });
  const packaged = process.env.MEGURI_TEST_APP;
  const app = await _electron.launch(
    packaged
      ? { ...options, executablePath: packaged, args: options.args.slice(1) }
      : options,
  );
  try {
    const page = await app.firstWindow();
    await skipFirstLaunchTour(page);
    await waitForIdle(page);
    await expect(page.getByTitle(name, { exact: true }).first()).toBeVisible();
    let dialog = await openDiscover(page);
    const open = dialog.getByRole("link", { name: "Open", exact: true });
    const timeline = dialog.getByRole("slider", { name: "Film timeline" });
    const thumbs = dialog.getByRole("button", { name: /^Seek to / });
    const density = dialog.getByLabel("Film thumbnails");
    await expect(thumbs).toHaveCount(29);
    await expect(thumbs.last()).toHaveAccessibleName("Seek to 2:22:30");
    await density.selectOption("60");
    await expect(thumbs).toHaveCount(145);
    await expect(thumbs.last()).toHaveAccessibleName("Seek to 2:24:30");

    const track = (await timeline.boundingBox())!;
    const y = track.y + track.height / 2;
    await page.mouse.move(track.x + track.width * 0.75, y);
    const hoverFrame = dialog.locator(
      '[data-slot="discovery-timeline-preview"] img',
    );
    await expect(hoverFrame).toBeVisible();
    await expect
      .poll(() =>
        hoverFrame.evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    const selectedTime = async () => {
      const href = (await open.getAttribute("href")) ?? "";
      return new URLSearchParams(href.split("?")[1]).get("t");
    };
    expect(await selectedTime()).toBeNull();
    await expect(dialog.locator("video")).toHaveCount(0);

    await page.mouse.down();
    await page.mouse.move(track.x + track.width * 0.9, y, { steps: 8 });
    expect(await selectedTime()).toBeNull();
    await page.mouse.up();
    const target = Number(await selectedTime());
    expect(target).toBeGreaterThan(7800);
    expect(target).toBeLessThan(7860);
    await timeline.press("ArrowRight");
    await expect
      .poll(async () => Number(await selectedTime()))
      .toBe(target + 1);
    await expect(page).toHaveURL(/#\/discover/);

    // The last thumbnail can be brought into view and used, even in the
    // densest mode. It hands off its time without leaving Discovery yet.
    await density.selectOption("30");
    await expect(thumbs).toHaveCount(290);
    await thumbs.last().scrollIntoViewIfNeeded();
    await thumbs.last().click();
    await expect.poll(selectedTime).toBe("8685");

    await dialog.getByTitle("Close (Esc)").click();
    dialog = await openDiscover(page);
    await expect(dialog.getByLabel("Film thumbnails")).toHaveValue("30");
    await expect.poll(selectedTime).toBeNull();
  } finally {
    await app.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
