export const SUBTITLE_WINDOW_SECONDS = 120;

const TEXT_CODECS = new Set([
  "subrip",
  "ass",
  "ssa",
  "webvtt",
  "mov_text",
  "text",
]);

export function isTextSubtitle(codec: string): boolean {
  return TEXT_CODECS.has(codec);
}

function languageKey(value: string): string {
  try {
    return new Intl.Locale(value).language;
  } catch {
    return value.trim().toLowerCase();
  }
}

export function sameSubtitleLanguage(a: string, b: string): boolean {
  return Boolean(a && b && languageKey(a) === languageKey(b));
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

function seconds(timestamp: string): number {
  return timestamp.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
}

/** FFmpeg emits WebVTT; retain readable text and timings for the player overlay. */
export function readWebVtt(vtt: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const block of vtt.replaceAll("\r", "").split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const timeLine = lines.findIndex((line) => /^\d[\d:.]* --> \d/.test(line));
    if (timeLine < 0) continue;
    const [start, , end] = lines[timeLine].trim().split(/\s+/);
    const begin = seconds(start);
    const finish = seconds(end);
    const text = lines
      .slice(timeLine + 1)
      .join("\n")
      .replace(/<[^>]*>/g, "")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&nbsp;", " ")
      .replaceAll("&amp;", "&")
      .trim();
    if (Number.isFinite(begin) && finish > begin && text)
      cues.push({ start: begin, end: finish, text });
  }
  return cues;
}
