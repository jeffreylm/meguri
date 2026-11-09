import { _electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { electronLaunchOptions } from "../scripts/electron-launch.cjs";
import { skipFirstLaunchTour, waitForIdle } from "./fixtures/helpers";

test("recovers reviewed Pexels links from a folder and selected clips, and remembers a renamed clip", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "meguri-pexels-e2e-"));
  const media = path.join(tmp, "media");
  const batch = path.join(media, "Batch");
  fs.mkdirSync(batch, { recursive: true });
  const suggested = "pexels-tima-miroshnichenko-5586539-1920x1080-30fps.mp4";
  const unknown = "Renamed download.mp4";
  const unselected = "2169880-hd_1920_1080_30fps.mp4";
  for (const [file, color] of [
    [suggested, "blue"],
    [unknown, "red"],
    [unselected, "green"],
  ]) {
    execFileSync(ffmpeg!, [
      "-v",
      "error",
      "-nostdin",
      "-f",
      "lavfi",
      "-i",
      `color=${color}:s=320x180:r=3:d=2`,
      "-c:v",
      "libx264",
      path.join(batch, file),
    ]);
  }
  const original = fs.readFileSync(path.join(batch, suggested));
  const launch = () =>
    _electron.launch(
      electronLaunchOptions({
        args: [`--user-data-dir=${path.join(tmp, "profile")}`],
        env: { MEGURI_DISABLE_TRAY: "1", MEGURI_ROOT: media },
      }),
    );
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await skipFirstLaunchTour(page);
    await waitForIdle(page);
    const folderView = page.getByRole("button", {
      name: "Show by folder",
      exact: true,
    });
    if ((await folderView.getAttribute("aria-pressed")) === "false")
      await folderView.click();
    await page.getByTestId("folder-card").filter({ hasText: "Batch" }).click();

    const recover = "Recover source links";
    const review = page.getByRole("dialog", { name: recover });
    await page
      .getByRole("navigation")
      .getByRole("button", { name: recover })
      .click();
    await expect(
      review.getByText("Source unknown", { exact: true }),
    ).toBeVisible();
    const suggestion = review.getByRole("checkbox", {
      name: new RegExp(suggested),
    });
    await expect(suggestion).not.toBeChecked();
    await expect(
      review.getByRole("button", { name: "Save links (0)" }),
    ).toBeDisabled();
    await suggestion.check();
    await review.getByRole("button", { name: "Save links (1)" }).click();
    await expect(review).toHaveCount(0);

    const pick = page.getByTestId("media-card").filter({
      has: page.getByTitle(path.join("Batch", unknown), { exact: true }),
    });
    await pick.hover();
    await pick.getByRole("button", { name: "Select", exact: true }).click();
    await page
      .getByRole("region", { name: "Selection actions" })
      .getByRole("button", { name: recover })
      .click();
    await expect(review.getByRole("listitem")).toHaveCount(1);
    const url = review.getByRole("textbox", { name: new RegExp(unknown) });
    await url.fill("https://example.com/video/44/");
    await expect(review.getByRole("alert")).toContainText(
      "Enter a Pexels video page URL",
    );
    await expect(
      review.getByRole("button", { name: "Save links (1)" }),
    ).toBeDisabled();
    await url.fill("https://www.pexels.com/video/my-clip-2499611/?ref=share");
    await review.getByRole("button", { name: "Save links (1)" }).click();
    await expect(review).toHaveCount(0);
    await page.getByRole("button", { name: "Exit selection" }).click();

    await page
      .getByRole("navigation")
      .getByRole("button", { name: recover })
      .click();
    await expect(
      review.getByText("Source already saved", { exact: true }),
    ).toHaveCount(2);
    await expect(
      review.getByRole("checkbox", { name: new RegExp(unselected) }),
    ).not.toBeChecked();
    await review.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.getByTitle(path.join("Batch", unknown), { exact: true }).click();
    const source = page.getByRole("region", { name: "Source", exact: true });
    await expect(source.getByText("Pexels · 2499611")).toBeAttached();
    await expect(
      source.getByRole("button", { name: "Open source" }),
    ).toBeAttached();
    await source.getByRole("button", { name: "Edit source" }).click();
    await expect(
      source.getByRole("textbox", { name: "Pexels video URL" }),
    ).toHaveValue("https://www.pexels.com/video/my-clip-2499611/");
    await source
      .getByRole("textbox", { name: "Pexels video URL" })
      .fill("https://www.pexels.com/video/2169880/");
    await source.getByRole("button", { name: "Save", exact: true }).click();
    await expect(source.getByText("Pexels · 2169880")).toBeAttached();

    expect(fs.readFileSync(path.join(batch, suggested))).toEqual(original);
    await app.close();
    const renamed = "Favourite footage.mp4";
    fs.renameSync(path.join(batch, suggested), path.join(batch, renamed));
    app = await launch();
    page = await app.firstWindow();
    await waitForIdle(page);
    await page.getByTitle(path.join("Batch", renamed), { exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: "Source", exact: true })
        .getByText("Pexels · 5586539"),
    ).toBeAttached();
  } finally {
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
