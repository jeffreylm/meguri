import type { QueryClient } from "@tanstack/react-query";
import type { FilmReviewRow } from "@shared/filmMetadata";
import { patchFileRowInCaches } from "./queryCache";

let sessionKey = "";
export function filmLookupKey() {
  return sessionKey;
}
export function rememberFilmLookupKey(key: string) {
  sessionKey = key;
}

export function refreshFilm(
  qc: QueryClient,
  row: FilmReviewRow,
  posterVersion?: string,
) {
  patchFileRowInCaches(qc, row.workspaceId, row.id, {
    filmPosterVersion: posterVersion ?? null,
  });
  for (const key of [
    "film_get",
    "files_search",
    "folder_files",
    "folders_list",
    "duplicates_list",
    "history_list",
    "graph_build",
    "timeline_counts",
    "activity_days",
  ])
    void qc.invalidateQueries({ queryKey: [key] });
}
