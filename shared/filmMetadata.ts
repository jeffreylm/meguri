import { z } from "zod";

export const FILM_BATCH_SIZE = 20;
export const FILM_CANDIDATE_TOKEN = "has:film-candidate";
export const FILM_SAVED_TOKEN = "has:film";
export const IMDbId = z.string().regex(/^tt\d{7,12}$/);
export const WikidataId = z.string().regex(/^Q[1-9]\d{0,14}$/);
export const FilmTitle = z.string().trim().min(1).max(300);
export const FilmYear = z.number().int().min(1870).max(2199);
export const OmdbKey = z
  .string()
  .trim()
  .regex(/^[a-z0-9]{1,128}$/i);

export function omdbKeyFromUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !["www.omdbapi.com", "omdbapi.com"].includes(url.host) ||
      url.username ||
      url.password ||
      url.pathname !== "/"
    )
      return null;
    const keys = url.searchParams.getAll("apikey");
    if (keys.length !== 1) return null;
    const result = OmdbKey.safeParse(keys[0]);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export interface FilmGuess {
  title: string;
  year?: number;
}

export interface FilmMatch {
  imdbId: string;
  wikidataId?: string;
  title: string;
  year: number;
}

export interface FilmMetadata extends FilmMatch {
  genres: string;
  directors: string;
  cast: string;
  plot: string;
  runtime: string;
  certificate: string;
  imdbRating: string;
  posterVersion?: string;
}

export interface FilmReviewRow {
  workspaceId: string;
  id: number;
  metaKey: string;
  relPath: string;
  guess: FilmGuess | null;
}

const RELEASE =
  /(?:^|\s)(?:\d{3,4}[pi]|[248]k|uhd|web[ ._-]*(?:dl|rip)|blu[ ._-]*ray|bdrip|brrip|remux|hdtv|dvdrip|dvd|amzn|nf|dsnp|atvp|hmax|x26[45]|h[ ._-]*26[45]|hevc|av1|eac3|ddp)(?=\s|$)/i;
const EPISODE =
  /\b(?:s\d{1,3}\s*e\d{1,4}|\d{1,2}x\d{1,3}|season\s+\d+|episode\s+\d+)\b/i;

/** Conservative suggestion for movies: a whole title, a year, and release markers. */
export function detectFilm(relPath: string): FilmGuess | null {
  const stem = (relPath.split(/[/\\]/).at(-1) ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/[._()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (EPISODE.test(stem)) return null;
  // Use the last plausible year before the technical suffix, allowing titles
  // such as "Blade Runner 2049 (2017)" or a title that is itself a year.
  const release = RELEASE.exec(stem);
  if (!release) return null;
  const prefix = stem.slice(0, release.index).trim();
  const year = /^(.*?)\s+((?:18[789]|19\d|20\d|21\d)\d)(?:\s.*)?$/.exec(prefix);
  const trailingYear = /^(.*?)\s+((?:18[789]|19\d|20\d|21\d)\d)$/.exec(prefix);
  const match = trailingYear ?? year;
  if (!match) return null;
  const title = match[1].trim().replace(/\s+-$/, "");
  return FilmTitle.safeParse(title).success
    ? { title, year: Number(match[2]) }
    : null;
}

export function filmSearchKey(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}
