// Resolved paths to bundled ffmpeg / ffprobe binaries. When packaged in asar,
// native binaries live in app.asar.unpacked (see electron-builder asarUnpack),
// so the static paths need rewriting at runtime.
import { ffmpegPath, ffprobePath } from "@zabuton-app/ffmpeg-binaries";

export function unpackedPath(p: string): string {
  return p.replace("app.asar", "app.asar.unpacked");
}

export const FFMPEG = unpackedPath(ffmpegPath || "ffmpeg");
export const FFPROBE = unpackedPath(ffprobePath || "ffprobe");
