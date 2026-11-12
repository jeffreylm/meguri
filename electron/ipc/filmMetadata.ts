import {
  FILM_BATCH_SIZE,
  FILM_CANDIDATE_TOKEN,
  type FilmReviewRow,
} from "../../shared/filmMetadata.js";
import { handle } from "../core/ipcHandler.js";
import { Semaphore } from "../core/concurrency.js";
import { loadFilm, lookupFilms } from "../core/omdb.js";
import {
  loadWikimediaFilm,
  lookupWikimediaFilms,
} from "../core/wikimediaFilms.js";
import { normalizeFilmPoster } from "./filmPoster.js";
import {
  currentFilmKey,
  filmKeyStatus,
  rememberValidatedFilmKey,
} from "./filmCredentials.js";
import {
  getFilm,
  getFilmRow,
  writeFilm,
} from "../core/queries/filmMetadata.js";
import type { SearchResult } from "../core/types.js";
import type { IpcContext } from "./context.js";
import { bulkTargetCores, coreById, queryTargets } from "./helpers.js";

export function registerFilmHandlers({ ws, queryClient }: IpcContext): void {
  const slots = new Semaphore(1);
  handle("film_key_status", filmKeyStatus);
  handle("film_get", ({ id, workspaceId }) => {
    const { db } = coreById(ws, workspaceId);
    const row = getFilmRow(db, workspaceId, id);
    return row ? { row, film: getFilm(db, id) } : null;
  });
  handle("film_candidates", async (scope) => {
    const rows: FilmReviewRow[] = [];
    if ("targets" in scope) {
      let offset = 0;
      for (const { core, workspaceId, fileIds } of bulkTargetCores(
        ws,
        scope.targets,
      )) {
        for (const id of new Set(fileIds)) {
          const index = offset++;
          if (index < (scope.offset ?? 0)) continue;
          const row = getFilmRow(core.db, workspaceId, id);
          if (!row?.guess || getFilm(core.db, id)) continue;
          if (rows.length === FILM_BATCH_SIZE)
            return { rows, more: true, nextOffset: index };
          rows.push(row);
        }
      }
      return { rows, more: false };
    }
    const collection = ws.activeCollection();
    const result = await queryClient.run<SearchResult>({
      kind: "search",
      targets: queryTargets(collection ? ws.allCores() : ws.queryCores()),
      query: {
        ...scope.query,
        folder: collection ? undefined : scope.query.folder,
        limit: FILM_BATCH_SIZE,
        allOf: [...(scope.query.allOf ?? []), { q: FILM_CANDIDATE_TOKEN }],
      },
      refs: collection?.items,
    });
    for (const item of result.items.slice(0, FILM_BATCH_SIZE)) {
      const core = ws.byId(item.workspaceId);
      const row = core && getFilmRow(core.db, item.workspaceId, item.id);
      if (row?.guess && core && !getFilm(core.db, item.id)) rows.push(row);
    }
    return { rows, more: result.nextCursor !== null, next: result.nextCursor };
  });
  handle("film_lookup", async ({ key, provider, ...input }) => {
    const release = await slots.acquire({ maxWaiting: 4 });
    try {
      if (provider === "wikimedia") return await lookupWikimediaFilms(input);
      const credential = key ?? (await currentFilmKey());
      if (!credential) throw new Error("Enter an OMDb API key.");
      const results = await lookupFilms(credential, input);
      if (key) await rememberValidatedFilmKey(key);
      return results;
    } finally {
      release();
    }
  });
  handle("film_save", async ({ workspaceId, ...target }) => {
    const release = await slots.acquire({ maxWaiting: 4 });
    try {
      if (
        getFilmRow(coreById(ws, workspaceId).db, workspaceId, target.id)
          ?.metaKey !== target.metaKey
      )
        throw new Error("This file changed. Reopen film info and try again.");
      const { db } = coreById(ws, workspaceId);
      if ("wikidataId" in target) {
        const film = await loadWikimediaFilm(target.wikidataId, target.year);
        const previous = getFilm(db, target.id);
        if (film.imdbId && previous?.imdbId === film.imdbId) {
          film.plot = previous.plot || film.plot;
          film.certificate = previous.certificate;
          film.imdbRating = previous.imdbRating;
        }
        if (!writeFilm(db, target, film))
          throw new Error("This file changed. Reopen film info and try again.");
        return getFilm(db, target.id) ?? film;
      }
      const { key, imdbId } = target;
      const credential = key ?? (await currentFilmKey());
      if (!credential) throw new Error("Enter an OMDb API key.");
      const { film, poster } = await loadFilm(
        credential,
        imdbId,
        normalizeFilmPoster,
      );
      if (!writeFilm(coreById(ws, workspaceId).db, target, film, poster))
        throw new Error("This file changed. Reopen film info and try again.");
      if (key) await rememberValidatedFilmKey(key);
      return getFilm(coreById(ws, workspaceId).db, target.id) ?? film;
    } finally {
      release();
    }
  });
  handle("film_remove", ({ workspaceId, ...target }) =>
    writeFilm(coreById(ws, workspaceId).db, target, null),
  );
}
