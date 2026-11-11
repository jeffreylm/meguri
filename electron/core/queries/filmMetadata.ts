import type { DB } from "../db.js";
import {
  detectFilm,
  filmSearchKey,
  type FilmMetadata,
  type FilmReviewRow,
} from "../../../shared/filmMetadata.js";

export const FILM_TABLE = `
  CREATE TABLE IF NOT EXISTS film_metadata (
    meta_key TEXT PRIMARY KEY,
    imdb_id TEXT NOT NULL,
    details TEXT NOT NULL,
    search_text TEXT NOT NULL,
    poster BLOB,
    poster_type TEXT,
    poster_version TEXT
  ) WITHOUT ROWID;
  CREATE TRIGGER IF NOT EXISTS film_file_changed
    AFTER UPDATE OF deleted_at, content_hash, kind ON files
    WHEN (NEW.deleted_at IS NOT NULL OR NEW.kind != 'video'
          OR (OLD.content_hash IS NOT NULL AND NEW.content_hash IS NOT OLD.content_hash))
      AND (NEW.deleted_at IS NOT OLD.deleted_at OR NEW.kind IS NOT OLD.kind
           OR NEW.content_hash IS NOT OLD.content_hash)
  BEGIN
    DELETE FROM film_metadata WHERE meta_key = OLD.meta_key
      AND NOT EXISTS (
        SELECT 1 FROM files WHERE meta_key = OLD.meta_key
          AND deleted_at IS NULL AND kind = 'video'
      );
  END;
`;

export interface FilmPoster {
  bytes: Buffer;
  type: "image/jpeg" | "image/png";
  version: string;
}

export function getFilmRow(
  db: DB,
  workspaceId: string,
  id: number,
): FilmReviewRow | null {
  const row = db
    .prepare(
      "SELECT id, rel_path AS relPath, meta_key AS metaKey FROM files WHERE id = ? AND kind = 'video' AND deleted_at IS NULL",
    )
    .get(id) as Omit<FilmReviewRow, "workspaceId" | "guess"> | undefined;
  return row ? { ...row, workspaceId, guess: detectFilm(row.relPath) } : null;
}

export function getFilm(db: DB, id: number): FilmMetadata | null {
  const row = db
    .prepare(
      `
    SELECT film.details, film.poster_version AS posterVersion
    FROM files f JOIN film_metadata film ON film.meta_key = f.meta_key
    WHERE f.id = ? AND f.deleted_at IS NULL AND f.kind = 'video'
  `,
    )
    .get(id) as { details: string; posterVersion: string | null } | undefined;
  return row
    ? {
        ...(JSON.parse(row.details) as FilmMetadata),
        posterVersion: row.posterVersion ?? undefined,
      }
    : null;
}

export function getFilmPoster(db: DB, id: number): FilmPoster | null {
  return (
    (db
      .prepare(
        `
    SELECT film.poster AS bytes, film.poster_type AS type, film.poster_version AS version
    FROM files f JOIN film_metadata film ON film.meta_key = f.meta_key
    WHERE f.id = ? AND f.deleted_at IS NULL AND f.kind = 'video' AND film.poster IS NOT NULL
  `,
      )
      .get(id) as FilmPoster | undefined) ?? null
  );
}

export function writeFilm(
  db: DB,
  target: Pick<FilmReviewRow, "id" | "metaKey">,
  film: FilmMetadata | null,
  poster?: FilmPoster,
): boolean {
  return db.transaction(() => {
    const row = db
      .prepare(
        "SELECT 1 FROM files WHERE id = ? AND meta_key = ? AND kind = 'video' AND deleted_at IS NULL",
      )
      .get(target.id, target.metaKey);
    if (!row) return false;
    if (!film) {
      db.prepare("DELETE FROM film_metadata WHERE meta_key = ?").run(
        target.metaKey,
      );
      return true;
    }
    const search = filmSearchKey(
      [
        film.imdbId,
        film.title,
        film.year,
        film.genres,
        film.directors,
        film.cast,
        film.plot,
        film.runtime,
        film.certificate,
        film.imdbRating,
      ].join("\n"),
    );
    db.prepare(
      `
      INSERT INTO film_metadata (meta_key, imdb_id, details, search_text, poster, poster_type, poster_version)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(meta_key) DO UPDATE SET imdb_id = excluded.imdb_id,
        details = excluded.details, search_text = excluded.search_text,
        poster = CASE WHEN excluded.poster IS NULL AND film_metadata.imdb_id = excluded.imdb_id THEN film_metadata.poster ELSE excluded.poster END,
        poster_type = CASE WHEN excluded.poster IS NULL AND film_metadata.imdb_id = excluded.imdb_id THEN film_metadata.poster_type ELSE excluded.poster_type END,
        poster_version = CASE WHEN excluded.poster IS NULL AND film_metadata.imdb_id = excluded.imdb_id THEN film_metadata.poster_version ELSE excluded.poster_version END
    `,
    ).run(
      target.metaKey,
      film.imdbId,
      JSON.stringify(film),
      search,
      poster?.bytes ?? null,
      poster?.type ?? null,
      poster?.version ?? null,
    );
    return true;
  })();
}
