import { _electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { electronLaunchOptions } from "../scripts/electron-launch.cjs";
import {
  openDiscover,
  skipFirstLaunchTour,
  waitForIdle,
} from "./fixtures/helpers";

test("saves a Discovery frame with searchable reference metadata", async () => {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "footage-deck-reference-"),
  );
  const media = path.join(temp, "media");
  fs.mkdirSync(media);
  const name = "Lighting test.mov";
  const output = path.join(temp, "lighting-reference.png");
  execFileSync(ffmpeg!, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x90:rate=25:duration=10",
    "-c:v",
    "libx264",
    "-timecode",
    "01:00:00:00",
    path.join(media, name),
  ]);
  const options = electronLaunchOptions({
    args: [`--user-data-dir=${path.join(temp, "profile")}`],
    env: { MEGURI_DISABLE_TRAY: "1", MEGURI_ROOT: media },
  });
  const packaged = process.env.MEGURI_TEST_APP;
  const app = await _electron.launch(
    packaged
      ? { ...options, executablePath: packaged, args: options.args.slice(1) }
      : options,
  );
  try {
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = () =>
        Promise.resolve({ canceled: false, filePath });
    }, output);
    const page = await app.firstWindow();
    await skipFirstLaunchTour(page);
    await waitForIdle(page);
    await expect(page.getByTitle(name, { exact: true }).first()).toBeVisible();
    const discovery = await openDiscover(page);
    await discovery
      .getByRole("button", { name: "Seek to 0:02", exact: true })
      .first()
      .click();
    await discovery
      .getByRole("button", { name: "Save reference still", exact: true })
      .click();
    const form = page.getByRole("dialog", { name: "Save reference still" });
    await form.getByLabel("Project", { exact: true }).fill("Grade test");
    await form.getByLabel("Reference note").fill("Shadow separation");
    await form.getByLabel("Scene", { exact: true }).fill("4");
    await form.getByLabel("16-bit PNG").check();
    await form
      .getByRole("button", { name: "Save reference still", exact: true })
      .click();
    await expect.poll(() => fs.existsSync(output)).toBe(true);
    const image = fs.readFileSync(output);
    expect(image[24]).toBe(16);
    expect(image.toString("utf8")).toContain("Shadow separation");
    expect(image.toString("utf8")).toContain(
      "<xmpDM:projectName>Grade test</xmpDM:projectName>",
    );
    expect(image.toString("utf8")).toContain("<xmpDM:scene>4</xmpDM:scene>");
    await expect(form).toHaveCount(0);
    await expect(page).toHaveURL(/#\/discover/);
  } finally {
    await app.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
