export const MEDIA_KINDS = ["video", "image", "audio"] as const;

const combinations = new Map<string, readonly (typeof MEDIA_KINDS)[number][]>([
  ["visual", ["video", "image"]],
  ["video+audio", ["video", "audio"]],
  ["image+audio", ["image", "audio"]],
  ["video+image+audio", MEDIA_KINDS],
]);

/** A legacy "visual" filter and newer combinations both represent an OR. */
export function selectedMediaKinds(kind?: string): readonly string[] {
  return kind ? (combinations.get(kind) ?? [kind]) : [];
}

export function mediaKindFilter(kinds: readonly string[]): string | undefined {
  const selected = MEDIA_KINDS.filter((kind) => kinds.includes(kind));
  const joined = selected.join("+");
  return joined === "video+image" ? "visual" : joined || undefined;
}
