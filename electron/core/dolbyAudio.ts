interface Stream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  disposition?: { attached_pic?: number; default?: number };
}

const DOLBY_CONTAINERS = new Set(["mp4", "m4v", "mov"]);

export function canHaveDirectDolby(ext: string): boolean {
  return DOLBY_CONTAINERS.has(ext);
}

/** Match the primary video and default audio of a directly played file. */
export function directDolbyTracks(
  raw: unknown,
): { audio: number; video: number } | undefined {
  let streams: Stream[];
  try {
    const data = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      streams?: Stream[];
    } | null;
    if (!Array.isArray(data?.streams)) return;
    streams = data.streams.filter(Boolean);
  } catch {
    return;
  }
  const audio = streams.filter((stream) => stream.codec_type === "audio");
  const selectedAudio = Math.max(
    0,
    audio.findIndex((stream) => stream.disposition?.default),
  );
  const codec = audio[selectedAudio]?.codec_name;
  if (codec !== "ac3" && codec !== "eac3") return;
  const videos = streams.filter(
    (stream) =>
      stream.codec_type === "video" && !stream.disposition?.attached_pic,
  );
  const primaryVideo =
    videos.find((stream) => stream.disposition?.default) ?? videos[0];
  const video = primaryVideo?.index;
  if (typeof video !== "number" || !Number.isSafeInteger(video) || video < 0)
    return;
  return { audio: selectedAudio, video };
}
