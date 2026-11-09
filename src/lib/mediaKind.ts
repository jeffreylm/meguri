// Kind-to-presentation mapping, shared by every site that labels or icons a media kind.
//
// `FileRow.kind` is typed as a plain string end to end (see shared/ipc/schema.ts), so
// TypeScript cannot flag the `kind === "video" ? … : …` shape that silently treats
// "not video" as "image". Consolidating those sites here means adding a kind touches
// one file instead of nine, and an unknown kind (a saved search from a newer
// build, say) degrades to a neutral fallback rather than being mislabelled.
import { File, Film, ImageIcon, Music, type LucideIcon } from "lucide-react";
import type { TranslationKey } from "@/i18n/locales/ja";
import type { SearchQuery } from "@/ipc/types";
import { selectedMediaKinds } from "@shared/mediaKindFilter";

/** Translation key for a known kind; null for one this build has no name for. */
export function kindLabelKey(kind: string): TranslationKey | null {
  switch (kind) {
    case "video":
      return "kind.video";
    case "image":
      return "kind.image";
    case "audio":
      return "kind.audio";
    case "visual":
      return "kind.visual";
    default:
      return null;
  }
}

export function kindIcon(kind: string): LucideIcon {
  switch (kind) {
    case "video":
      return Film;
    case "image":
      return ImageIcon;
    case "audio":
      return Music;
    default:
      return File;
  }
}

/** True for kinds that play along a timeline (and so carry a duration). */
export function hasTimeline(kind: string): boolean {
  return kind === "video" || kind === "audio";
}

/** Translated label for a kind, or the raw value when this build has no name for it. */
export function kindLabel(
  t: (key: TranslationKey) => string,
  kind: string,
): string {
  const key = kindLabelKey(kind);
  return key ? t(key) : kind;
}

export function mediaFilterLabel(
  t: (key: TranslationKey) => string,
  kind: string,
): string {
  return selectedMediaKinds(kind)
    .map((value) => kindLabel(t, value))
    .join(" + ");
}

export function withMediaKind(query: SearchQuery, kind?: string): SearchQuery {
  const next = { ...query };
  if (kind) next.kind = kind;
  else delete next.kind;
  if (kind === "audio") delete next.resolution;
  else delete next.audio;
  return next;
}
