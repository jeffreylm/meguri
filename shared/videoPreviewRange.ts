export const SDR_PREVIEW_PARAM = "sdrPreview";

export function isHdrVideo(metadata: unknown): boolean {
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
    return (
      video?.color_transfer === "smpte2084" ||
      video?.color_transfer === "arib-std-b67"
    );
  } catch {
    return false;
  }
}
