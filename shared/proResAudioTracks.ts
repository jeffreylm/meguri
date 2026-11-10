export const PREVIEW_AUDIO_TRACK_PARAM = "audioTrack";

/** The order here matches FFmpeg's zero-based 0:a:N mapping. */
export function readProResAudioTracks(raw: unknown) {
  let metadata = raw;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata) as unknown;
    } catch {
      return [];
    }
  }
  const streams = (metadata as { streams?: unknown } | null)?.streams;
  if (!Array.isArray(streams)) return [];
  const tracks: { title: string; language: string }[] = [];
  for (const stream of streams as {
    codec_type?: unknown;
    tags?: { title?: unknown; handler_name?: unknown; language?: unknown };
  }[]) {
    if (stream?.codec_type !== "audio") continue;
    const title = stream.tags?.title ?? stream.tags?.handler_name;
    const language = stream.tags?.language;
    tracks.push({
      title:
        typeof title === "string" && title !== "SoundHandler"
          ? title.trim()
          : "",
      language:
        typeof language === "string" && language !== "und"
          ? language.trim()
          : "",
    });
  }
  return tracks;
}
