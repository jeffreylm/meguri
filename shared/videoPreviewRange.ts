export const SDR_PREVIEW_PARAM = "sdrPreview";

export function videoHdrTransfer(metadata: unknown): "pq" | "hlg" | undefined {
  try {
    const { streams } = (
      typeof metadata === "string" ? JSON.parse(metadata) : (metadata ?? {})
    ) as {
      streams?: {
        codec_type?: string;
        color_transfer?: string;
        disposition?: { attached_pic?: number };
      }[];
    };
    const video = Array.isArray(streams)
      ? streams.find(
          (stream) =>
            stream?.codec_type === "video" && !stream.disposition?.attached_pic,
        )
      : undefined;
    if (video?.color_transfer === "smpte2084") return "pq";
    if (video?.color_transfer === "arib-std-b67") return "hlg";
  } catch {
    return undefined;
  }
}

export function isHdrVideo(metadata: unknown): boolean {
  return videoHdrTransfer(metadata) !== undefined;
}
