import type { SearchQuery } from "@/ipc/types";
import { cleanConditions } from "./smartCollections";
import {
  MEDIA_KINDS,
  mediaKindFilter,
  selectedMediaKinds,
} from "@shared/mediaKindFilter";

export function queryClauses(query: SearchQuery): SearchQuery[] {
  const { allOf, ...own } = query;
  return [own, ...(allOf ?? [])];
}

export function binKinds(query: SearchQuery): string[] {
  let kinds: string[] = [...MEDIA_KINDS];
  for (const part of queryClauses(query)) {
    if (part.kind) {
      const selected = selectedMediaKinds(part.kind);
      kinds = kinds.filter((kind) => selected.includes(kind));
    }
    if (part.resolution) kinds = kinds.filter((kind) => kind !== "audio");
  }
  return kinds;
}

/** Applicability is about media types, not whether two valid values overlap.
 * A 720p filter is meaningful in a 4K video bin: their AND query returns zero.
 * Only controls that do not apply to the bin's kinds are paused. */
export function compatibleBinFilters(incoming: SearchQuery, base: SearchQuery) {
  const applied = structuredClone(cleanConditions(incoming));
  const omitted: SearchQuery = {};
  const kinds = binKinds(base);
  const drop = (key: keyof SearchQuery) => {
    if (applied[key] !== undefined)
      Object.assign(omitted, { [key]: applied[key] });
    delete applied[key];
  };
  if (applied.kind) {
    const selected = selectedMediaKinds(applied.kind);
    const matching = selected.filter((kind) => kinds.includes(kind));
    if (!matching.length) drop("kind");
    // A partially applicable OR can still return matches. Keep the complete
    // selection in the incoming filters so the next visit can evaluate it.
    else if (matching.length < selected.length)
      applied.kind = mediaKindFilter(matching);
  }
  if (
    !kinds.includes("audio") ||
    (incoming.kind === "audio" && applied.kind !== "audio")
  )
    drop("audio");
  if (!kinds.some((kind) => kind !== "audio")) drop("resolution");
  return { applied, omitted };
}

/** Preserve both sets of rules, including text/tag expressions, without overwriting either. */
export function queryWithinBin(
  filters: SearchQuery,
  base: SearchQuery,
): SearchQuery {
  const { allOf: extra, ...own } = cleanConditions(filters);
  const clauses = queryClauses(cleanConditions(base))
    .map((part) => {
      const rule = { ...part };
      delete rule.sort;
      delete rule.sortDir;
      return rule;
    })
    .filter((part) => Object.keys(part).length > 0);
  return {
    ...own,
    sort: own.sort ?? base.sort,
    sortDir: own.sort ? own.sortDir : (own.sortDir ?? base.sortDir),
    allOf: [...clauses, ...(extra ?? [])],
  };
}

/** Apply only actual user edits; a skipped incoming filter is not erased by an unrelated edit. */
export function patchIncoming(
  incoming: SearchQuery,
  before: SearchQuery,
  after: SearchQuery,
): SearchQuery {
  const next = { ...incoming };
  for (const key of new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ] as (keyof SearchQuery)[])) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (key === "audio") {
      const audio = { ...incoming.audio };
      for (const field of new Set([
        ...Object.keys(before.audio ?? {}),
        ...Object.keys(after.audio ?? {}),
      ] as (keyof NonNullable<SearchQuery["audio"]>)[])) {
        if (before.audio?.[field] === after.audio?.[field]) continue;
        if (after.audio?.[field] === undefined) delete audio[field];
        else Object.assign(audio, { [field]: after.audio[field] });
      }
      next.audio = Object.keys(audio).length ? audio : undefined;
      continue;
    }
    if (after[key] === undefined) delete next[key];
    else Object.assign(next, { [key]: after[key] });
  }
  return cleanConditions(next);
}
