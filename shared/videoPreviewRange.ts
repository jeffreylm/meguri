export const SDR_PREVIEW_PARAM = "sdrPreview";
export const HDR_PREVIEW_FPS = 30;
export const HDR_PREVIEW_WIDTH = 1280;
export const HDR_PREVIEW_HEIGHT = 720;

interface VideoStream {
  codec_type?: string;
  color_transfer?: string;
  color_primaries?: string;
  color_space?: string;
  disposition?: { attached_pic?: number };
}

function videoStreams(metadata: unknown): VideoStream[] {
  try {
    const { streams } = (
      typeof metadata === "string" ? JSON.parse(metadata) : (metadata ?? {})
    ) as { streams?: VideoStream[] };
    return Array.isArray(streams)
      ? streams.filter(
          (stream) =>
            stream?.codec_type === "video" && !stream.disposition?.attached_pic,
        )
      : [];
  } catch {
    return [];
  }
}

function hdrTransfer(stream?: VideoStream): "pq" | "hlg" | undefined {
  if (stream?.color_transfer === "smpte2084") return "pq";
  if (stream?.color_transfer === "arib-std-b67") return "hlg";
}

export function videoHdrTransfer(metadata: unknown): "pq" | "hlg" | undefined {
  return hdrTransfer(videoStreams(metadata)[0]);
}

export function isHdrVideo(metadata: unknown): boolean {
  return videoHdrTransfer(metadata) !== undefined;
}

export function hdrGradeTransfer(metadata: unknown): "pq" | "hlg" | undefined {
  const [video, otherVideo] = videoStreams(metadata);
  if (
    otherVideo ||
    video?.color_primaries !== "bt2020" ||
    video.color_space !== "bt2020nc"
  )
    return;
  return hdrTransfer(video);
}
