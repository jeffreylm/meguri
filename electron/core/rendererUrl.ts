import path from "node:path";
import { pathToFileURL } from "node:url";

export const RENDERER_FILE = path.join(__dirname, "../renderer/index.html");
const bundledUrl = pathToFileURL(RENDERER_FILE).href;

/** Only the application entry may use the native IPC bridge. Routes use hashes. */
export function isAppRendererUrl(value: string, devUrl?: string): boolean {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.href === bundledUrl) return true;
    if (!devUrl) return false;
    const dev = new URL(devUrl);
    dev.hash = "";
    return url.href === dev.href;
  } catch {
    return false;
  }
}
