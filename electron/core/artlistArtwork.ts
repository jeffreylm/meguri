import path from "node:path";
import { z } from "zod";
import type { ArtworkTrack } from "./audioArtwork.js";
import type { DB } from "./db.js";

export const ARTLIST_DOWNLOADS = "https://artlist.io/downloads/music";
const ARTLIST_COVERS = "https://artlist-albums.imgix.net";

function isArtlistCover(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === ARTLIST_COVERS &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/images/")
    );
  } catch {
    return false;
  }
}

const downloadRow = z.object({
  songId: z.string().regex(/^\d{1,12}$/),
  title: z.string().min(1).max(300),
  artists: z.array(z.string().min(1).max(200)).min(1).max(12),
  durationSeconds: z
    .number()
    .int()
    .min(1)
    .max(24 * 3600),
  cover: z.string().max(2048).refine(isArtlistCover),
});

export type ArtlistDownload = z.infer<typeof downloadRow>;

// The signed-in page is an external renderer. Read only the rendered song
// list and image attributes. Parse the returned values again in the main process.
export const READ_ARTLIST_DOWNLOADS = String.raw`
(() => {
  const list = document.querySelector('[role="list"] a[href*="/royalty-free-music/album/"]')?.closest('[role="list"]');
  const rows = [];
  for (const album of list?.querySelectorAll('a[href*="/royalty-free-music/album/"]') ?? []) {
    const image = album.querySelector('img');
    if (!image) continue;
    for (let row = album.parentElement; row && row !== list; row = row.parentElement) {
      const songs = row.querySelectorAll('a[href*="/royalty-free-music/song/"]');
      if (songs.length > 1) break;
      const song = songs[0];
      const time = row.innerText?.match(/^(\d+):(\d{2})$/m);
      if (!song || !time) continue;
      const songId = song.pathname.match(/\/(\d+)\/?$/)?.[1];
      const artists = Array.from(row.querySelectorAll('a[href*="/royalty-free-music/artist/"]'), link => link.innerText.trim());
      const cover = image.getAttribute('srcset')?.split(/,\s*/).find(candidate => candidate.endsWith(' 384w'))?.split(/\s+/)[0] || image.currentSrc;
      rows.push({
        songId, title: song.innerText.trim(), artists, cover,
        durationSeconds: Number(time[1]) * 60 + Number(time[2]),
      });
      break;
    }
    if (rows.length >= 200) break;
  }
  const page = document.scrollingElement;
  return { rows, top: page?.scrollTop ?? 0, height: page?.scrollHeight ?? 0, viewport: page?.clientHeight ?? 0 };
})()
`;

const pageSchema = z.object({
  rows: z.array(z.unknown()).max(200),
  top: z.number().nonnegative(),
  height: z.number().nonnegative(),
  viewport: z.number().nonnegative(),
});

export function parseArtlistPage(value: unknown) {
  const page = pageSchema.parse(value);
  return {
    ...page,
    rows: page.rows.flatMap((row) => {
      const parsed = downloadRow.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    }),
  };
}

type Candidate = { path: string; duration: number; contentHash: string };

export function artlistArtworkCandidates(db: DB): Candidate[] {
  return db
    .prepare(
      `
      SELECT f.rel_path AS path, f.duration, f.content_hash AS contentHash
      FROM files f
      WHERE f.kind = 'audio' AND f.deleted_at IS NULL AND f.thumb_status = 'done'
        AND f.thumb_path IS NULL AND f.duration > 0 AND f.content_hash IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM audio_artwork a WHERE a.meta_key = f.meta_key)
    `,
    )
    .all() as Candidate[];
}

function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function matchArtlistArtwork(
  candidates: readonly Candidate[],
  rows: Iterable<ArtlistDownload>,
): { albums: Map<string, ArtworkTrack[]>; ambiguous: number } {
  const byName = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = nameKey(path.parse(candidate.path).name);
    const sameName = byName.get(key) ?? [];
    sameName.push(candidate);
    byName.set(key, sameName);
  }
  const matches = new Map<
    string,
    { candidate: Candidate; row: ArtlistDownload }
  >();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    const artist = row.artists.join(" ");
    const keys = new Set(
      [
        `${artist} - ${row.title}`,
        `${row.title} - ${artist}`,
        `${row.title} by ${artist}`,
        `${row.title} by ${artist} Artlist`,
      ].map(nameKey),
    );
    for (const key of keys) {
      for (const candidate of byName.get(key) ?? []) {
        if (Math.abs(candidate.duration - row.durationSeconds) > 1) continue;
        const previous = matches.get(candidate.path);
        if (previous && previous.row.songId !== row.songId) {
          ambiguous.add(candidate.path);
        }
        matches.set(candidate.path, { candidate, row });
      }
    }
  }
  const albums = new Map<string, ArtworkTrack[]>();
  for (const { candidate, row } of matches.values()) {
    if (ambiguous.has(candidate.path)) continue;
    const tracks = albums.get(row.cover) ?? [];
    tracks.push({
      path: candidate.path,
      contentHash: candidate.contentHash,
      durationSeconds: row.durationSeconds,
    });
    albums.set(row.cover, tracks);
  }
  return { albums, ambiguous: ambiguous.size };
}
