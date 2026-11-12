import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, updateConfig, type AppConfig } from "../appConfig.js";
import {
  checkForUpdates,
  compareVersions,
  ignoreVersion,
  updateDownloadUrl,
} from "../updater.js";

const request = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({
  app: { getVersion: () => "0.9.0", isPackaged: true },
  net: { request },
}));
vi.mock("../appConfig.js", () => ({
  loadConfig: vi.fn(),
  updateConfig: vi.fn(),
}));

const forkReleases = "https://github.com/jeffreylm/meguri/releases";

describe("compareVersions", () => {
  it("treats equal versions as 0", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  });

  it("detects a newer version", () => {
    expect(compareVersions("0.2.0", "0.1.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.10", "1.2.9")).toBeGreaterThan(0);
  });

  it("detects an older version", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0);
    expect(compareVersions("1.2.3", "1.3.0")).toBeLessThan(0);
  });

  it("ignores a leading v and is case-insensitive", () => {
    expect(compareVersions("v0.2.0", "0.1.0")).toBeGreaterThan(0);
    expect(compareVersions("V1.0.0", "v1.0.0")).toBe(0);
  });

  it("treats missing components as 0", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1", "1.0.1")).toBeLessThan(0);
  });

  it("drops a pre-release suffix and compares the core", () => {
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBe(0);
    expect(compareVersions("1.1.0-rc1", "1.0.0")).toBeGreaterThan(0);
  });

  it("tolerates non-numeric garbage by treating it as 0", () => {
    expect(compareVersions("1.x.0", "1.0.0")).toBe(0);
  });
});

describe("updateDownloadUrl", () => {
  it("uses the fork release page for a build", () => {
    expect(updateDownloadUrl("v0.1.0+build.20")).toBe(
      `${forkReleases}/tag/v0.1.0%2Bbuild.20`,
    );
  });

  it("opens the fork release list when there is no release tag", () => {
    expect(updateDownloadUrl()).toBe(forkReleases);
  });
});

describe("personal build checks", () => {
  function respond(statusCode: number, body: unknown = {}) {
    request.mockImplementation(() => {
      const client = Object.assign(new EventEmitter(), {
        setHeader: vi.fn(),
        abort: vi.fn(),
        end: () => {
          const response = Object.assign(new EventEmitter(), { statusCode });
          client.emit("response", response);
          response.emit("data", Buffer.from(JSON.stringify(body)));
          response.emit("end");
        },
      });
      return client;
    });
  }

  beforeEach(() => {
    vi.stubGlobal("__MEGURI_BUILD_ID__", "19.3");
    request.mockReset();
    let config = {
      update: {
        autoCheck: true,
        ignoredVersion: "0.10.0",
        lastCheckAt: Date.now(),
      },
    } as AppConfig;
    vi.mocked(loadConfig).mockImplementation(() => config);
    vi.mocked(updateConfig).mockImplementation(
      (update) => (config = update(config)),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("checks the fork immediately after switching channels and uses its release link", async () => {
    respond(200, {
      tag_name: "v0.1.0+build.20",
      html_url: "https://github.com/zabuton-app/meguri/releases/tag/v0.10.0",
    });
    await expect(checkForUpdates()).resolves.toMatchObject({
      current: "0.9.0 · Build 19.3",
      latest: "0.1.0 · Build 20",
      available: true,
      url: `${forkReleases}/tag/v0.1.0%2Bbuild.20`,
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      url: "https://api.github.com/repos/jeffreylm/meguri/releases/latest",
    });
    await expect(checkForUpdates()).resolves.toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["v0.9.0+build.19.10", true],
    ["v0.9.0+build.19.3", false],
    ["v0.10.0+build.19.2", false],
    ["v0.10.0", false],
  ])("checks build order for %s", async (tag_name, available) => {
    respond(200, { tag_name });
    await expect(checkForUpdates({ force: true })).resolves.toMatchObject({
      available,
    });
  });

  it("remembers a skipped personal build", async () => {
    respond(200, { tag_name: "v0.1.0+build.20" });
    ignoreVersion("0.1.0 · Build 20");
    await expect(checkForUpdates({ force: true })).resolves.toMatchObject({
      available: false,
    });
  });

  it("returns the release list for an empty fork and reports other failures", async () => {
    respond(404);
    await expect(checkForUpdates({ force: true })).resolves.toMatchObject({
      latest: null,
      available: false,
      url: forkReleases,
    });
    respond(403);
    await expect(checkForUpdates({ force: true })).resolves.toBeNull();
  });
});
