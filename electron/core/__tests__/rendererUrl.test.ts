import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isAppRendererUrl, RENDERER_FILE } from "../rendererUrl.js";

describe("trusted renderer URL", () => {
  const bundled = pathToFileURL(RENDERER_FILE).href;
  const dev = "http://localhost:5173/";

  it("accepts the bundled page and configured dev entry with app routes", () => {
    expect(isAppRendererUrl(`${bundled}#/file/1?ws=abc`, dev)).toBe(true);
    expect(isAppRendererUrl(`${dev}#/detached/1`, dev)).toBe(true);
  });

  it.each([
    "file:///tmp/unrelated.html",
    "https://www.omdbapi.com/",
    "http://localhost:5173/another-page",
    "http://localhost:5173/?other=document",
    "http://localhost:5174/",
    "about:blank",
  ])("rejects a different document at %s", (url) => {
    expect(isAppRendererUrl(url, dev)).toBe(false);
  });
});
