import { HDR_PREVIEW_FPS } from "@shared/videoPreviewRange";

export function openHdrFrames(
  source: string,
  start: number,
  width: number,
  height: number,
  still: boolean,
  transfer: "pq" | "hlg",
) {
  const controller = new AbortController();
  const url = new URL(source);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !/\/media\/\d+$/.test(url.pathname)
  )
    throw new Error("HDR grading needs a local library video");
  url.pathname = url.pathname.replace(/\/media\/(\d+)$/, "/hdr-frames/$1");
  url.search = new URLSearchParams({
    t: start.toFixed(6),
    w: String(width),
    h: String(height),
    still: still ? "1" : "0",
  }).toString();

  const response = fetch(url, { signal: controller.signal }).then((res) => {
    if (!res.ok || res.headers.get("X-Hdr-Transfer") !== transfer || !res.body)
      throw new Error(`10-bit HDR preview unavailable (${res.status})`);
    return res.body.getReader();
  });
  // P010 has a 16-bit luma plane and a half-size interleaved UV plane.
  const frameBytes = width * height * 3;
  let chunk = new Uint8Array(0);
  let offset = 0;
  let index = -1;
  let frame: Uint8Array<ArrayBuffer> | undefined;
  let finished = false;

  async function readFrame() {
    const reader = await response;
    const bytes = new Uint8Array(frameBytes);
    let written = 0;
    while (written < bytes.length) {
      if (offset === chunk.length) {
        const result = await reader.read();
        if (result.done) {
          if (written) throw new Error("Incomplete HDR video frame");
          return undefined;
        }
        chunk = result.value;
        offset = 0;
      }
      const size = Math.min(chunk.length - offset, bytes.length - written);
      bytes.set(chunk.subarray(offset, offset + size), written);
      written += size;
      offset += size;
    }
    return bytes;
  }

  return {
    async frameAt(at: number) {
      const target = still
        ? 0
        : Math.max(0, Math.floor((at - start) * HDR_PREVIEW_FPS + 0.001));
      while (!finished && index < target) {
        const next = await readFrame();
        if (next) {
          frame = next;
          index++;
        } else finished = true;
      }
      if (!frame) throw new Error("No 10-bit HDR frames received");
      return { bytes: frame, at: start + index / HDR_PREVIEW_FPS };
    },
    close() {
      controller.abort();
    },
  };
}
