import { DEFAULT_AUDIO_TRACK } from "@shared/playbackTracks";

const PREFIX = "meguri.playbackTracks.";
export const AUTO_SUBTITLE = -2;
export const SUBTITLES_OFF = -1;

export function playbackPreferenceKey(wsId: string, relPath: string): string {
  return PREFIX + JSON.stringify([wsId, relPath]);
}

export function readPlaybackPreference(key: string | undefined) {
  try {
    const value = key
      ? (JSON.parse(localStorage.getItem(key) ?? "{}") as {
          audio?: number;
          subtitle?: number;
        })
      : {};
    return {
      audio:
        Number.isSafeInteger(value.audio) && value.audio! >= DEFAULT_AUDIO_TRACK
          ? value.audio!
          : DEFAULT_AUDIO_TRACK,
      subtitle:
        Number.isSafeInteger(value.subtitle) && value.subtitle! >= AUTO_SUBTITLE
          ? value.subtitle!
          : AUTO_SUBTITLE,
    };
  } catch {
    return { audio: DEFAULT_AUDIO_TRACK, subtitle: AUTO_SUBTITLE };
  }
}

export function savePlaybackPreference(
  key: string | undefined,
  patch: Partial<ReturnType<typeof readPlaybackPreference>>,
): void {
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ ...readPlaybackPreference(key), ...patch }),
    );
  } catch {
    // Playback still works if browser storage is unavailable.
  }
}
