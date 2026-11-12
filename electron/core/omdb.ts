import { createHash } from "node:crypto";
import {
  FilmTitle,
  FilmYear,
  IMDbId,
  type FilmMatch,
  type FilmMetadata,
} from "../../shared/filmMetadata.js";
import type { FilmPoster } from "./queries/filmMetadata.js";

type OmdbRecord = Record<string, unknown>;
export type PosterType = "image/jpeg" | "image/png";
type NormalizePoster = (
  bytes: Buffer,
  type: PosterType,
) => Promise<Buffer | undefined>;

export function imdbIdFromInput(value: string): string | null {
  if (IMDbId.safeParse(value).success) return value;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["imdb.com", "www.imdb.com"].includes(url.host)
    )
      return null;
    return /^\/title\/(tt\d{7,12})\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is OmdbRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMatch(value: unknown): FilmMatch | null {
  if (!isRecord(value) || value.Type !== "movie") return null;
  const id = IMDbId.safeParse(value.imdbID);
  const title = FilmTitle.safeParse(value.Title);
  const year = FilmYear.safeParse(
    typeof value.Year === "string" && /^\d{4}$/.test(value.Year.trim())
      ? Number(value.Year)
      : value.Year,
  );
  return id.success && title.success && year.success
    ? { imdbId: id.data, title: title.data, year: year.data }
    : null;
}

export async function readBounded(
  response: Response,
  limit: number,
): Promise<Buffer> {
  if (!response.body || Number(response.headers.get("content-length")) > limit)
    throw new Error("Response is too large");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return Buffer.concat(chunks, size);
      const value: unknown = chunk.value;
      if (!(value instanceof Uint8Array)) throw new Error("Invalid response");
      size += value.byteLength;
      if (size > limit) throw new Error("Response is too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function queryOmdb(
  key: string,
  query: Record<string, string>,
  request: typeof fetch,
): Promise<OmdbRecord | null> {
  const url = new URL("https://www.omdbapi.com/");
  url.search = new URLSearchParams({
    ...query,
    apikey: key,
    type: "movie",
  }).toString();
  let body: unknown;
  try {
    const response = await request(url, {
      redirect: "error",
      signal: AbortSignal.timeout(9_000),
    });
    if (response.status === 401) throw new Error("key");
    if (response.status === 429) throw new Error("limit");
    if (!response.ok) throw new Error("connection");
    body = JSON.parse(
      (await readBounded(response, 128 * 1024)).toString("utf8"),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "key")
      throw new Error(
        "OMDb rejected the key. Check that it has been activated.",
      );
    if (error instanceof Error && error.message === "limit")
      throw new Error("OMDb’s request limit has been reached.");
    throw new Error("Could not reach OMDb. Try again.");
  }
  if (!isRecord(body)) throw new Error("OMDb returned an unreadable response.");
  if (body.Response === "False") {
    if (
      typeof body.Error === "string" &&
      /not found|incorrect imdb id/i.test(body.Error)
    )
      return null;
    if (typeof body.Error === "string" && /request limit/i.test(body.Error))
      throw new Error("OMDb’s request limit has been reached.");
    throw new Error(
      "OMDb could not complete the lookup. Check your key and search.",
    );
  }
  return body;
}

export async function lookupFilms(
  key: string,
  input: { text: string; year?: number },
  request = fetch,
): Promise<FilmMatch[]> {
  const imdbId = imdbIdFromInput(input.text);
  if (imdbId) {
    const match = parseMatch(await queryOmdb(key, { i: imdbId }, request));
    return match?.imdbId === imdbId ? [match] : [];
  }
  if (/^https?:\/\//i.test(input.text))
    throw new Error("Enter a film title, IMDb ID or IMDb title link.");
  const query: Record<string, string> = { s: input.text };
  if (input.year !== undefined) query.y = String(input.year);
  const body = await queryOmdb(key, query, request);
  if (!Array.isArray(body?.Search)) return [];
  return body.Search.flatMap((row: unknown) => {
    const match = parseMatch(row);
    return match ? [match] : [];
  }).slice(0, 10);
}

async function downloadPoster(
  raw: unknown,
  normalizePoster: NormalizePoster,
  request: typeof fetch,
): Promise<FilmPoster | undefined> {
  if (typeof raw !== "string") return;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      ![
        "m.media-amazon.com",
        "images-na.ssl-images-amazon.com",
        "ia.media-imdb.com",
      ].includes(url.host)
    )
      return;
    const response = await request(url, {
      redirect: "error",
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) return;
    const type = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (type !== "image/jpeg" && type !== "image/png") {
      await response.body?.cancel();
      return;
    }
    const bytes = await readBounded(response, 2 * 1024 * 1024);
    const header = bytes.subarray(0, 8).toString("hex");
    const isJpeg = type === "image/jpeg";
    if (isJpeg ? !header.startsWith("ffd8ff") : header !== "89504e470d0a1a0a")
      return;
    const normalized = await normalizePoster(bytes, type);
    if (normalized)
      return {
        bytes: normalized,
        type: "image/jpeg",
        version: createHash("sha256").update(normalized).digest("hex"),
      };
  } catch {
    // A poster is optional. The confirmed text remains useful without one.
  }
}

export async function loadFilm(
  key: string,
  imdbId: string,
  normalizePoster: NormalizePoster,
  request = fetch,
): Promise<{ film: FilmMetadata; poster?: FilmPoster }> {
  const body = await queryOmdb(key, { i: imdbId, plot: "full" }, request);
  const match = parseMatch(body);
  if (!body || match?.imdbId !== imdbId)
    throw new Error("OMDb could not load this film.");
  const field = (name: string, max = 600) => {
    const value = body[name];
    return typeof value === "string" && value !== "N/A"
      ? value.trim().slice(0, max)
      : "";
  };
  return {
    film: {
      ...match,
      genres: field("Genre"),
      directors: field("Director"),
      cast: field("Actors"),
      plot: field("Plot", 8_000),
      runtime: field("Runtime", 40),
      certificate: field("Rated", 40),
      imdbRating: field("imdbRating", 12),
    },
    poster: await downloadPoster(body.Poster, normalizePoster, request),
  };
}
