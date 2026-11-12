import { _electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { electronLaunchOptions } from "../scripts/electron-launch.cjs";
import { skipFirstLaunchTour, waitForIdle } from "./fixtures/helpers";

test("saves safe film metadata and reuses a protected key after restart", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "meguri-film-security-"));
  const media = path.join(tmp, "media");
  fs.mkdirSync(media);
  const name = "A City at Night (2025) (1080p WEB-DL).mp4";
  execFileSync(ffmpeg!, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=blue:size=96x64:rate=12:duration=1",
    "-c:v",
    "libx264",
    path.join(media, name),
  ]);
  const profile = path.join(tmp, "profile");
  const options = electronLaunchOptions({
    args: [`--user-data-dir=${profile}`],
    env: { MEGURI_DISABLE_TRAY: "1", MEGURI_ROOT: media },
  });
  const packaged = process.env.MEGURI_TEST_APP;
  const payload = '<img data-injected-film-markup src=x onerror="alert(1)">';
  const png = fs.readFileSync("e2e/fixtures/media/test.png").toString("base64");
  const launch = () =>
    _electron.launch(
      packaged
        ? { ...options, executablePath: packaged, args: options.args.slice(1) }
        : options,
    );
  let app = await launch();
  const mockNetwork = () =>
    app.evaluate(
      (_electron, { payload, png }) => {
        const request = globalThis.fetch;
        globalThis.fetch = async (input, options) => {
          const url = new URL(input instanceof Request ? input.url : input);
          if (url.host === "www.omdbapi.com") {
            if (url.searchParams.get("apikey") !== "test123")
              return new Response(null, { status: 401 });
            const film = {
              imdbID: "tt12345678",
              Title: "A City at Night",
              Year: "2025",
              Type: "movie",
              Plot: payload,
              Poster: "https://m.media-amazon.com/images/test.png",
            };
            return Response.json(
              url.searchParams.has("s") ? { Search: [film] } : film,
            );
          }
          if (url.host === "m.media-amazon.com")
            return new Response(new Uint8Array(Buffer.from(png, "base64")), {
              headers: { "Content-Type": "image/png" },
            });
          return request(input, options);
        };
      },
      { payload, png },
    );

  try {
    await mockNetwork();
    const page = await app.firstWindow();
    await skipFirstLaunchTour(page);
    await waitForIdle(page);
    await page.getByTitle(name, { exact: true }).click();
    const details = page.getByRole("region", {
      name: "Film details",
      exact: true,
    });
    await details
      .getByRole("button", { name: "Get film info", exact: true })
      .click();
    await page
      .getByLabel("OMDb API URL from your email", { exact: true })
      .fill("http://www.omdbapi.com/?i=tt12345678&apikey=test123");
    await page
      .getByRole("button", { name: "Look up film", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Matching film" })
      .selectOption("tt12345678");
    const posterResponse = page.waitForResponse((response) =>
      response.url().includes("/poster/"),
    );
    await page
      .getByRole("button", { name: "Save matches (1)", exact: true })
      .click();
    const review = page.getByRole("dialog", { name: "Get film info" });
    await expect(review.getByText("Film details saved")).toBeVisible();
    await review
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await expect(details.getByText(payload, { exact: true })).toBeVisible();
    await expect(page.locator("[data-injected-film-markup]")).toHaveCount(0);
    const poster = details.locator("img");
    await expect
      .poll(() =>
        poster.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    const response = await posterResponse;
    expect(await response.headerValue("content-type")).toBe("image/jpeg");
    expect(await response.headerValue("x-content-type-options")).toBe(
      "nosniff",
    );
    if (process.platform === "darwin" || process.platform === "win32") {
      const encrypted = fs.readFileSync(path.join(profile, "omdb-key.bin"));
      expect(encrypted.includes("test123")).toBe(false);
      await app.close();
      app = await launch();
      await mockNetwork();
      const reopened = await app.firstWindow();
      await reopened.getByTitle(name, { exact: true }).click();
      await reopened
        .getByRole("region", { name: "Film details", exact: true })
        .getByRole("button", { name: "Change film match" })
        .click();
      await expect(
        reopened.getByText("A saved OMDb key is ready to use."),
      ).toBeVisible();
      await expect(
        reopened.getByLabel("OMDb API key", { exact: true }),
      ).toHaveValue("");
      await reopened
        .getByRole("button", { name: "Look up film", exact: true })
        .click();
      await expect(
        reopened
          .getByRole("combobox", { name: "Matching film" })
          .locator("option[value=tt12345678]"),
      ).toHaveCount(1);
    }
  } finally {
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
