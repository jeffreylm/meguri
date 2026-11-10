import {
  BrowserWindow,
  session,
  type Session,
  type WebContents,
} from "electron";
import { setTimeout as delay } from "node:timers/promises";
import { applyAudioArtwork } from "../core/audioArtwork.js";
import {
  ARTLIST_DOWNLOADS,
  READ_ARTLIST_DOWNLOADS,
  artlistArtworkCandidates,
  matchArtlistArtwork,
  parseArtlistPage,
  type ArtlistDownload,
} from "../core/artlistArtwork.js";
import { handle } from "../core/ipcHandler.js";
import { normalizeCoverImage } from "./coverImage.js";
import type { IpcContext } from "./context.js";
import { coreById } from "./helpers.js";

const SCROLL_PAUSE_MS = 1500;
const MAX_SCROLLS = 400;
const MAX_COVER_BYTES = 2 * 1024 * 1024;
let artlistSession: Session | undefined;

export function isArtlistContents(contents: WebContents): boolean {
  return contents.session === artlistSession;
}

function isArtlistPage(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      (url.hostname === "artlist.io" || url.hostname.endsWith(".artlist.io"))
    );
  } catch {
    return false;
  }
}

function isDownloadsPage(value: string): boolean {
  if (!value) return false;
  const url = new URL(value);
  return (
    url.origin === "https://artlist.io" &&
    url.pathname.replace(/\/$/, "") === "/downloads/music"
  );
}

function createArtlistWindow(): BrowserWindow {
  if (!artlistSession) {
    // This is an in-memory partition. The sign-in lasts for the app session.
    artlistSession = session.fromPartition("artlist-artwork");
    artlistSession.setPermissionRequestHandler(
      (_contents, _permission, reply) => reply(false),
    );
    artlistSession.setPermissionCheckHandler(() => false);
    artlistSession.on("will-download", (event) => event.preventDefault());
  }
  const win = new BrowserWindow({
    title: "Artlist",
    width: 1120,
    height: 800,
    webPreferences: {
      session: artlistSession,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!isArtlistPage(url)) event.preventDefault();
  });
  win.webContents.on("will-redirect", (event, url, _inPlace, mainFrame) => {
    if (mainFrame && !isArtlistPage(url)) event.preventDefault();
  });
  return win;
}

async function readHistory(
  contents: WebContents,
  signal: AbortSignal,
): Promise<{ rows: Map<string, ArtlistDownload>; complete: boolean }> {
  const rows = new Map<string, ArtlistDownload>();
  let previous: { top: number; height: number; count: number } | undefined;
  let stable = 0;
  for (let step = 0; step < MAX_SCROLLS; step++) {
    signal.throwIfAborted();
    if (!isDownloadsPage(contents.getURL())) break;
    const page = parseArtlistPage(
      await contents.executeJavaScript(READ_ARTLIST_DOWNLOADS),
    );
    if (step === 0 && page.top > 1) {
      await contents.executeJavaScript("window.scrollTo(0, 0)");
      await delay(SCROLL_PAUSE_MS, undefined, { signal });
      continue;
    }
    for (const row of page.rows) rows.set(row.songId, row);
    const atEnd = page.top + page.viewport >= page.height - 2;
    if (
      previous &&
      previous.count === rows.size &&
      previous.top === page.top &&
      previous.height === page.height
    ) {
      stable++;
    } else {
      stable = 0;
    }
    if (stable >= 4) return { rows, complete: atEnd && rows.size > 0 };
    previous = { top: page.top, height: page.height, count: rows.size };
    if (!atEnd && page.rows.length) {
      // Read the current batch before scrolling. Overlap viewports because
      // Artlist recycles its rows, and give each lazy-loaded batch time to land.
      await contents.executeJavaScript(
        "window.scrollBy(0, Math.max(1, Math.floor(window.innerHeight * 0.65)))",
      );
    }
    await delay(SCROLL_PAUSE_MS, undefined, { signal });
  }
  return { rows, complete: false };
}

async function fetchCover(
  url: string,
  signal: AbortSignal,
): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "image/jpeg, image/png" },
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const value: unknown = chunk.value;
      if (!(value instanceof Uint8Array)) {
        await reader.cancel();
        return null;
      }
      size += value.length;
      if (size > MAX_COVER_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return normalizeCoverImage(Buffer.concat(chunks, size));
  } catch {
    return null;
  }
}

export function registerArtlistArtworkHandlers(ctx: IpcContext): void {
  let window: BrowserWindow | null = null;
  let running: AbortController | null = null;

  const showArtlist = (): BrowserWindow => {
    if (!window || window.isDestroyed()) {
      window = createArtlistWindow();
      window.on("closed", () => {
        window = null;
        running?.abort();
      });
      void window.loadURL(ARTLIST_DOWNLOADS).catch(() => {});
    }
    window.show();
    window.focus();
    return window;
  };

  handle("artlist_artwork_open", () => {
    showArtlist();
  });
  handle("artlist_artwork_cancel", () => {
    running?.abort();
  });
  handle("artlist_artwork_find", async ({ workspaceId }) => {
    if (running) return null;
    if (!window || window.isDestroyed()) {
      showArtlist();
      return { status: "sign-in", added: 0 };
    }
    const win = window;
    const db = coreById(ctx.ws, workspaceId).db;
    const candidates = artlistArtworkCandidates(db);
    if (candidates.length === 0) {
      return { status: "done", added: 0, remaining: 0, ambiguous: 0 };
    }

    const controller = new AbortController();
    running = controller;
    const { signal } = controller;
    let added = 0;
    try {
      const contents = win.webContents;
      if (!isDownloadsPage(contents.getURL())) {
        await win.loadURL(ARTLIST_DOWNLOADS);
      }
      const history = await readHistory(contents, signal);
      if (!history.rows.size) {
        showArtlist();
        return { status: "sign-in", added: 0 };
      }
      // Resolve ambiguities against the history before writing any covers.
      const { albums, ambiguous } = matchArtlistArtwork(
        candidates,
        history.rows.values(),
      );
      for (const [url, tracks] of albums) {
        signal.throwIfAborted();
        const png = await fetchCover(url, signal);
        signal.throwIfAborted();
        if (!png) continue;
        const { fileIds } = applyAudioArtwork(db, [{ tracks, png }], true);
        added += fileIds.length;
        for (const id of fileIds) ctx.emit("thumb:done", { id, workspaceId });
      }
      return {
        status: history.complete ? "done" : "partial",
        added,
        remaining: artlistArtworkCandidates(db).length,
        ambiguous,
      };
    } catch (error) {
      if (signal.aborted) return { status: "stopped", added };
      throw error;
    } finally {
      running = null;
    }
  });
}
