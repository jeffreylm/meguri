import { PREVIEW_AUDIO_TRACK_PARAM } from "@shared/proResAudioTracks";

// The media server URL of a file and its seek query parameter, `t`: the second
// a container the browser cannot seek by itself (mkv/avi/wmv/flv/ts, remuxed
// on the fly) is re-served from. The player writes it, the hand-off between
// routes must see through it, and a player adopting such an element has to
// read it back as its position offset — one place for all three.

/** `src` re-served from `sec` seconds in. */
export function withStreamSeek(
  src: string,
  sec: number,
  precise = false,
): string {
  const url = new URL(src);
  url.searchParams.set(
    "t",
    String(precise ? Math.round(sec * 1000) / 1000 : Math.floor(sec)),
  );
  return url.toString();
}

export function withPreviewAudioTrack(src: string, track: number): string {
  const url = new URL(src);
  if (track === 0) url.searchParams.delete(PREVIEW_AUDIO_TRACK_PARAM);
  else url.searchParams.set(PREVIEW_AUDIO_TRACK_PARAM, String(track));
  return url.toString();
}

export function previewAudioTrackOf(src: string | null): number {
  if (!src) return 0;
  try {
    const track = Number(
      new URL(src).searchParams.get(PREVIEW_AUDIO_TRACK_PARAM),
    );
    return Number.isSafeInteger(track) && track > 0 ? track : 0;
  } catch {
    return 0;
  }
}

/** Strip seek and track options so the current preview can be handed off. */
export function withoutPlaybackOptions(src: string | null): string {
  if (!src) return "";
  try {
    const url = new URL(src);
    url.searchParams.delete("t");
    url.searchParams.delete(PREVIEW_AUDIO_TRACK_PARAM);
    return url.toString();
  } catch {
    return src;
  }
}

/** Whether two URLs name the same file, regardless of the preview position or track. */
export function isSameMediaSource(a: string | null, b: string | null): boolean {
  return withoutPlaybackOptions(a) === withoutPlaybackOptions(b);
}

/** The second `src` was re-served from; 0 when served from the top. */
export function streamOffsetOf(src: string | null): number {
  if (!src) return 0;
  try {
    const t = Number(new URL(src).searchParams.get("t"));
    return Number.isFinite(t) && t > 0 ? t : 0;
  } catch {
    return 0;
  }
}
