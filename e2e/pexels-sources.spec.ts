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
    await page.route("https://images.pexels.com/videos/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (
        pathname.includes("/2169880/") ||
        pathname.endsWith("/free-video-5586539.jpg")
      ) {
        return route.fulfill({ status: 404 });
      }
      return route.fulfill({
        path: path.resolve("e2e/fixtures/media/test.png"),
      });
    });
    await skipFirstLaunchTour(page);
    await waitForIdle(page);
    const folderView = page.getByRole("button", {
      name: "Show by folder",
      exact: true,
    });
    if ((await folderView.getAttribute("aria-pressed")) === "false")
      await folderView.click();
    await page.getByTestId("folder-card").filter({ hasText: "Batch" }).click();

    const review = page.getByRole("dialog", { name: "Recover source links" });
    const toolbar = page.locator("header");
    const closeReview = () =>
      review
        .locator('[data-slot="dialog-footer"]')
        .getByRole("button", { name: "Close", exact: true })
        .click();
    await toolbar.getByRole("button", { name: "Recover folder links" }).click();
    await expect(
      review.getByText("Source unknown", { exact: true }),
    ).toBeVisible();
    const suggestion = review.getByRole("checkbox", {
      name: `Save this link — ${path.join("Batch", suggested)}`,
    });
    await expect(suggestion).not.toBeChecked();
    const proposed = review
      .getByRole("listitem")
      .filter({ hasText: suggested });
    await expect(
      proposed.getByText("Suggested from filename · Pexels 5586539", {
        exact: true,
      }),
    ).toBeVisible();
    const localPreview = proposed.getByRole("img", { name: "Library clip" });
    const pexelsPreview = proposed.getByRole("img", { name: "Pexels preview" });
    await proposed.scrollIntoViewIfNeeded();
    await expect(
      proposed.getByText("320 × 180", { exact: true }),
    ).toBeVisible();
    await expect(proposed.locator('[data-slot="file-extension"]')).toHaveText(
      "MP4",
    );
    const fileTitle = proposed.getByTitle(path.join("Batch", suggested), {
      exact: true,
    });
    expect(
      await fileTitle.evaluate((element) => element.firstChild?.textContent),
    ).toBe(path.join("Batch", path.parse(suggested).name));
    await expect(localPreview).toHaveAttribute("src", /\/thumb\/\d+/);
    await expect(localPreview).not.toHaveJSProperty("naturalWidth", 0);
    await expect(pexelsPreview).toHaveAttribute(
      "src",
      /\/videos\/5586539\/pictures\/preview-0\.jpg/,
    );
    await expect(pexelsPreview).not.toHaveJSProperty("naturalWidth", 0);
    const missingPreview = review
      .getByRole("listitem")
      .filter({ hasText: unselected });
    await missingPreview.scrollIntoViewIfNeeded();
    await expect(
      missingPreview.getByText("Preview unavailable", { exact: true }),
    ).toBeVisible();
    await expect(
      review.getByRole("button", { name: "Save links (0)" }),
    ).toBeDisabled();
    await suggestion.check();
    await review.getByRole("button", { name: "Save links (1)" }).click();
    await expect(
      proposed.getByText("Source already saved · Pexels 5586539"),
    ).toBeVisible();
    await expect(review.getByRole("status")).toHaveText(
      "Source links saved: 1",
    );
    await closeReview();

    const local = page.getByRole("button", { name: "Local", exact: true });
    if ((await local.getAttribute("aria-pressed")) === "false")
      await local.click();
    await page
      .getByRole("button", { name: "Create smart bin", exact: true })
      .click();
    const binEditor = page.getByRole("dialog", { name: "Create smart bin" });
    await binEditor.getByRole("textbox", { name: "Name" }).fill("Stock videos");
    await binEditor.getByRole("radio", { name: "Video", exact: true }).click();
    await binEditor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Leave smart bin" }),
    ).toBeVisible();

    const pick = page.getByTestId("media-card").filter({
      has: page.getByTitle(path.join("Batch", unknown), { exact: true }),
    });
    await pick.hover();
    await pick.getByRole("button", { name: "Select", exact: true }).click();
    await toolbar
      .getByRole("button", { name: "Recover selected links" })
      .click();
    await expect(review.getByRole("listitem")).toHaveCount(1);
    await expect(review.getByRole("listitem")).toContainText(unknown);
    await closeReview();

    const selectionAction = page
      .getByRole("region", { name: "Selection actions" })
      .getByRole("button", { name: "Recover selected links" });
    await expect(selectionAction).toHaveText("Recover selected links");
    await selectionAction.click();
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
    await url.blur();
    await expect(
      review.getByRole("img", { name: "Pexels preview" }),
    ).toHaveAttribute("src", /\/videos\/2499611\/free-video-2499611\.jpg/);
    await review.getByRole("button", { name: "Save links (1)" }).click();
    await expect(
      review.getByText("Source already saved · Pexels 2499611"),
    ).toBeVisible();
    await review.getByRole("button", { name: "Edit source" }).click();
    await expect(url).toHaveValue(
      "https://www.pexels.com/video/my-clip-2499611/",
    );
    await url.fill("https://www.pexels.com/video/1448735/");
    await review.getByRole("button", { name: "Save", exact: true }).click();
    await expect(review.getByRole("status")).toHaveText("Source link updated.");
    await expect(
      review.getByText("Source already saved · Pexels 1448735"),
    ).toBeVisible();
    await review.getByRole("button", { name: "Edit source" }).click();
    await review.getByRole("button", { name: "Remove source" }).click();
    await expect(review.getByRole("status")).toHaveText("Source link removed.");
    await expect(
      review.getByText("Source unknown", { exact: true }),
    ).toBeVisible();
    await expect(url).toHaveValue("");
    await url.fill("https://www.pexels.com/video/my-clip-2499611/");
    await review.getByRole("button", { name: "Save links (1)" }).click();
    await expect(
      review.getByText("Source already saved · Pexels 2499611"),
    ).toBeVisible();
    await closeReview();
    await page.getByRole("button", { name: "Exit selection" }).click();

    await toolbar.getByRole("button", { name: "Recover folder links" }).click();
    await expect(
      review.getByText(/^Source already saved · Pexels/),
    ).toHaveCount(2);
    await expect(
      review.getByRole("checkbox", {
        name: `Save this link — ${path.join("Batch", unselected)}`,
      }),
    ).not.toBeChecked();
    await closeReview();

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
