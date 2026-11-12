import { execFile } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { crc32 } from "node:zlib";
import { z } from "zod";
import type { ChannelInput } from "../../shared/ipc/channels.js";
import { FFMPEG } from "./ffmpeg-paths.js";
import { extractMeta, type FrameFormat } from "./media.js";
import { DECODE_FFMPEG_THREADS } from "./mediaConcurrency.js";
import { supportsToneMapping } from "./proResPreview.js";

type ReferenceDetails = NonNullable<ChannelInput<"frame_export">["reference"]>;
type StillSource = {
  title: string;
  fileName: string;
  contentHash?: string;
  url?: string;
  credit?: string;
  keywords: string[];
};

const execFileAsync = promisify(execFile);
const MAX_STILL_BYTES = 256 * 1024 * 1024;
const PROBE = z.object({
  format: z
    .object({
      start_time: z.string().optional(),
      tags: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  streams: z
    .array(
      z.object({
        codec_type: z.string().optional(),
        start_time: z.string().optional(),
        avg_frame_rate: z.string().optional(),
        r_frame_rate: z.string().optional(),
        color_range: z.string().optional(),
        color_space: z.string().optional(),
        color_transfer: z.string().optional(),
        color_primaries: z.string().optional(),
        disposition: z
          .object({ attached_pic: z.number().optional() })
          .optional(),
        tags: z.record(z.string(), z.string()).optional(),
      }),
    )
    .optional(),
});

// XML 1.0 excludes these control characters from text nodes.
const xml = (value: string) =>
  // eslint-disable-next-line no-control-regex
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(
    /[<>&"']/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[char] ?? char,
  );

const alternate = (field: string, value: string) =>
  value
    ? `<dc:${field}><rdf:Alt><rdf:li xml:lang="x-default">${xml(value)}</rdf:li></rdf:Alt></dc:${field}>`
    : "";

function writeXmp(image: Buffer, xmp: string, format: FrameFormat): Buffer {
  if (format === "jpeg") {
    if (image.subarray(0, 2).toString("hex") !== "ffd8")
      throw new Error("Invalid JPEG");
    const payload = Buffer.from(`http://ns.adobe.com/xap/1.0/\0${xmp}`);
    if (payload.length + 2 > 65_535)
      throw new Error("Still metadata is too large");
    const header = Buffer.from([0xff, 0xe1, 0, 0]);
    header.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([
      image.subarray(0, 2),
      header,
      payload,
      image.subarray(2),
    ]);
  }
  if (
    image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    image.subarray(12, 16).toString() !== "IHDR"
  )
    throw new Error("Invalid PNG");
  const data = Buffer.from(`XML:com.adobe.xmp\0\0\0\0\0${xmp}`);
  const type = Buffer.from("iTXt");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  // The first PNG chunk is the 13-byte IHDR. Place XMP before the image data.
  return Buffer.concat([
    image.subarray(0, 33),
    length,
    type,
    data,
    checksum,
    image.subarray(33),
  ]);
}

function formatTimecode(
  start: string | undefined,
  rate: string | undefined,
  offset: number,
) {
  const match = start && /^(\d\d):(\d\d):(\d\d)([:;])(\d\d)$/.exec(start);
  const rational = rate && /^(\d+)\/(\d+)$/.exec(rate);
  if (!match || !rational || !Number(rational[2])) return undefined;
  const fps = Number(rational[1]) / Number(rational[2]);
  const nominal = Math.round(fps);
  if (!nominal || nominal > 120) return undefined;
  const [hours, minutes, seconds, frames] = [
    match[1],
    match[2],
    match[3],
    match[5],
  ].map(Number);
  if (hours > 23 || minutes > 59 || seconds > 59 || frames >= nominal)
    return undefined;
  const drop =
    match[4] === ";"
      ? rate === "30000/1001"
        ? 2
        : rate === "60000/1001"
          ? 4
          : 0
      : 0;
  if (match[4] === ";" && !drop) return undefined;
  const totalMinutes = hours * 60 + minutes;
  let frame =
    (totalMinutes * 60 + seconds) * nominal +
    frames -
    drop * (totalMinutes - Math.floor(totalMinutes / 10)) +
    Math.round(Math.max(0, offset) * fps);
  if (drop) {
    const framesPerMinute = nominal * 60 - drop;
    const framesPerTenMinutes = nominal * 600 - 9 * drop;
    frame %= framesPerTenMinutes * 144;
    frame +=
      drop *
      (9 * Math.floor(frame / framesPerTenMinutes) +
        Math.max(
          0,
          Math.floor(((frame % framesPerTenMinutes) - drop) / framesPerMinute),
        ));
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = [
    Math.floor(frame / nominal / 3600) % 24,
    Math.floor(frame / nominal / 60) % 60,
    Math.floor(frame / nominal) % 60,
  ]
    .map(pad)
    .join(":");
  return `${time}${match[4]}${pad(frame % nominal)}`;
}

function buildXmp(
  source: StillSource,
  details: ReferenceDetails,
  frame: object,
) {
  const keywordList = [...new Set(source.keywords)].slice(0, 40);
  const resolveMetadata = {
    Description: source.title,
    Comments: details.note,
    Keywords: keywordList.join(", "),
    Scene: details.scene,
    Shot: details.shot,
    Take: details.take,
    "Reel Number": details.reel,
  };
  const text = [
    alternate("title", source.title),
    alternate("description", details.note ?? ""),
    `<dc:source>${xml(source.url ?? source.fileName)}</dc:source>`,
    `<dc:subject><rdf:Bag>${keywordList.map((word) => `<rdf:li>${xml(word)}</rdf:li>`).join("")}</rdf:Bag></dc:subject>`,
    `<xmp:CreateDate>${new Date().toISOString()}</xmp:CreateDate>`,
    ...Object.entries({
      projectName: details.project,
      scene: details.scene,
      shotName: details.shot,
      takeNumber: /^\d+$/.test(details.take ?? "") ? details.take : undefined,
      tapeName: details.reel,
    }).flatMap(([key, value]) =>
      value ? [`<xmpDM:${key}>${xml(value)}</xmpDM:${key}>`] : [],
    ),
    `<fd:Reference>${xml(JSON.stringify({ ...frame, source, details, resolveMetadata }))}</fd:Reference>`,
  ].join("");
  return `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpDM="http://ns.adobe.com/xmp/1.0/DynamicMedia/" xmlns:fd="https://github.com/jeffreylm/meguri/ns/reference/1.0/">${text}</rdf:Description></rdf:RDF></x:xmpmeta>`;
}

export async function exportReferenceStill(
  src: string,
  dest: string,
  requested: number,
  format: FrameFormat,
  source: StillSource,
  details: ReferenceDetails,
): Promise<void> {
  const meta = await extractMeta(src, "video");
  const probe = PROBE.parse(meta.raw);
  const video = probe.streams?.find(
    (stream) =>
      stream.codec_type === "video" && stream.disposition?.attached_pic !== 1,
  );
  if (!video) throw new Error("Could not read the source video metadata");
  const start = Number(probe.format?.start_time) || 0;
  const videoStart = Number(video.start_time);
  const sourceStart = Number.isFinite(videoStart) ? videoStart : start;
  const sourceTimecode =
    video.tags?.timecode ??
    probe.format?.tags?.timecode ??
    probe.streams?.find((stream) => stream.tags?.timecode)?.tags?.timecode;
  const hdr =
    video.color_transfer === "smpte2084" ||
    video.color_transfer === "arib-std-b67";
  if (hdr && !(await supportsToneMapping())) {
    throw new Error("This build cannot convert HDR reference stills");
  }
  const highPrecision = format === "png" && details.highPrecision;
  const pixelFormat =
    format === "jpeg" ? "yuvj444p" : highPrecision ? "rgb48be" : "rgb24";
  const filters = [`trim=start=${(start + requested).toFixed(6)}`, "showinfo"];
  if (hdr) {
    filters.push(
      "zscale=t=linear:npl=100",
      "format=gbrpf32le",
      "zscale=p=bt709",
      "tonemap=tonemap=mobius:desat=2",
      format === "jpeg"
        ? "zscale=t=iec61966-2-1:m=bt709:r=full"
        : "zscale=t=iec61966-2-1:m=gbr:r=full",
    );
  }
  filters.push(`format=${pixelFormat}`);
  const sourceColor = {
    primaries: video.color_primaries,
    transfer: video.color_transfer,
    matrix: video.color_space,
    range: video.color_range,
  };
  const outputColor = {
    primaries: hdr ? "bt709" : sourceColor.primaries,
    transfer: hdr ? "iec61966-2-1" : sourceColor.transfer,
    matrix: format === "png" ? "gbr" : hdr ? "bt709" : sourceColor.matrix,
    range: "full",
    bitDepth: highPrecision ? 16 : 8,
    transform: hdr ? "Mobius HDR to SDR (sRGB)" : "No tone mapping",
  };

  const temporary = await mkdtemp(
    path.join(path.dirname(dest), ".footage-deck-"),
  );
  try {
    const output = path.join(
      temporary,
      format === "jpeg" ? "still.jpg" : "still.png",
    );
    const args = [
      "-nostdin",
      "-hide_banner",
      "-v",
      "info",
      "-copyts",
      "-threads",
      String(DECODE_FFMPEG_THREADS),
      "-ss",
      String(Math.max(0, requested - 3)),
      "-i",
      src,
      "-map",
      "0:V:0",
      "-an",
      "-sn",
      "-vf",
      filters.join(","),
      "-frames:v",
      "1",
      "-fps_mode",
      "passthrough",
    ];
    if (format === "png") {
      if (outputColor.primaries && outputColor.primaries !== "unknown") {
        args.push("-color_primaries", outputColor.primaries);
      }
      if (outputColor.transfer && outputColor.transfer !== "unknown") {
        args.push("-color_trc", outputColor.transfer);
      }
      args.push("-colorspace", "rgb", "-color_range", "pc", "-c:v", "png");
    } else args.push("-c:v", "mjpeg", "-q:v", "2");
    args.push("-update", "1", output);
    const { stderr } = await execFileAsync(FFMPEG, args, {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    const timestamp = /\bn:\s*0\s+pts:\s*(-?\d+)/.exec(stderr)?.[1];
    const timeBase = /config in time_base:\s*(\d+)\/(\d+)/.exec(stderr);
    const pts = timeBase
      ? (Number(timestamp) * Number(timeBase[1])) / Number(timeBase[2])
      : NaN;
    if (!Number.isFinite(pts))
      throw new Error("Could not identify the exported frame");
    const { size } = await stat(output);
    if (!size || size > MAX_STILL_BYTES) throw new Error("Invalid still size");
    const frameRate = video.avg_frame_rate;
    const timecode =
      frameRate === video.r_frame_rate
        ? formatTimecode(sourceTimecode, frameRate, pts - sourceStart)
        : undefined;
    const xmp = buildXmp(source, details, {
      requestedOffsetSeconds: requested,
      sourceOffsetSeconds: Number(Math.max(0, pts - start).toFixed(6)),
      sourceTimestamp: timestamp,
      sourceTimeBase: timeBase?.slice(1).join("/"),
      sourceTimecode: timecode,
      sourceStartTimecode: sourceTimecode,
      frameRate,
      sourceColor,
      outputColor,
    });
    await writeFile(output, writeXmp(await readFile(output), xmp, format));
    await rename(output, dest);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
