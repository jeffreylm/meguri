import { WebContentsView } from "electron";
import { withTimeout } from "../core/concurrency.js";
import type { PosterType } from "../core/omdb.js";

const MAX_PIXELS = 8 * 1024 * 1024;
const MAX_POSTER_BYTES = 2 * 1024 * 1024;
const BLANK_PAGE =
  "data:text/html," +
  encodeURIComponent(
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">',
  );
const JPEG_PREFIX = "data:image/jpeg;base64,";
const JPEG_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function fitsPixelLimit(width: number, height: number): boolean {
  return width > 0 && height > 0 && width * height <= MAX_PIXELS;
}

function hasBoundedDimensions(bytes: Buffer, type: PosterType): boolean {
  if (type === "image/png") {
    return (
      bytes.length >= 33 &&
      bytes.readUInt32BE(8) === 13 &&
      bytes.toString("ascii", 12, 16) === "IHDR" &&
      fitsPixelLimit(bytes.readUInt32BE(16), bytes.readUInt32BE(20))
    );
  }
  // A JPEG's frame header holds the dimensions before the compressed scan.
  for (let offset = 2; offset + 3 < bytes.length;) {
    if (bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length)
      return false;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return false;
    if (JPEG_FRAME_MARKERS.has(marker))
      return (
        length >= 8 &&
        fitsPixelLimit(
          bytes.readUInt16BE(offset + 5),
          bytes.readUInt16BE(offset + 3),
        )
      );
    offset += length;
  }
  return false;
}

// The isolated renderer receives image bytes only. It has no app preload,
// persistent session, remote page, or native bridge.
export async function normalizeFilmPoster(
  bytes: Buffer,
  type: PosterType,
): Promise<Buffer | undefined> {
  if (!hasBoundedDimensions(bytes, type)) return;
  const { webContents } = new WebContentsView({
    webPreferences: {
      partition: "film-poster-decoder",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  try {
    const result = await withTimeout(
      (async () => {
        await webContents.loadURL(BLANK_PAGE);
        return (await webContents.executeJavaScript(`
        (async (data, type, maxPixels) => {
          const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
          const image = await createImageBitmap(new Blob([bytes], { type }));
          try {
            if (image.width * image.height > maxPixels) return null;
            const scale = Math.min(1, 600 / image.width, 900 / image.height);
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) return null;
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/jpeg", 0.86);
          } finally {
            image.close();
          }
        })(${JSON.stringify(bytes.toString("base64"))}, ${JSON.stringify(type)}, ${MAX_PIXELS})
      `)) as unknown;
      })(),
      5_000,
    );
    if (
      typeof result !== "string" ||
      !result.startsWith(JPEG_PREFIX) ||
      result.length > JPEG_PREFIX.length + Math.ceil(MAX_POSTER_BYTES / 3) * 4
    )
      return;
    const jpeg = Buffer.from(result.slice(JPEG_PREFIX.length), "base64");
    if (
      jpeg.length <= MAX_POSTER_BYTES &&
      jpeg.subarray(0, 3).toString("hex") === "ffd8ff"
    )
      return jpeg;
  } finally {
    if (!webContents.isDestroyed()) webContents.close();
  }
}
