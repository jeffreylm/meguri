import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { detectFilm, omdbKeyFromUrl } from "../../../shared/filmMetadata.js";
import { lookupFilms, loadFilm } from "../omdb.js";
import { searchFiles } from "../queries/files.js";
import {
  getFilm,
  getFilmPoster,
  getFilmRow,
  writeFilm,
} from "../queries/filmMetadata.js";
import { migrateMetaKey, pruneOrphanMeta } from "../queries/meta.js";
import { syncFiles } from "../scan.js";
import { insertFile, newDb } from "./helpers.js";

const sample = "A City at Night (2025) (1080p AMZN WEB-DL x265).mkv";
const details = {
  imdbId: "tt12345678",
  title: "A City at Night",
  year: 2025,
  genres: "Drama, Thriller",
  directors: "Alex Rivera",
  cast: "Morgan Lee",
  plot: "A village near the border.",
  runtime: "157 min",
  certificate: "",
  imdbRating: "",
};
const poster = {
  bytes: Buffer.from("sample artwork"),
  type: "image/jpeg" as const,
  version: "hash",
};

describe("film catalogue", () => {
  it("keeps the entire title and requires convincing movie signals", () => {
    expect(detectFilm(sample)).toEqual({
      title: "A City at Night",
      year: 2025,
    });
    expect(
      detectFilm("Movies/Blade.Runner.2049.2017.2160p.WEB-DL.mkv"),
    ).toEqual({ title: "Blade Runner 2049", year: 2017 });
    expect(detectFilm("The.Show.S01E02.2025.1080p.WEB-DL.mkv")).toBeNull();
    expect(detectFilm("Pexels-beach-2025.mp4")).toBeNull();
    expect(detectFilm("Studio sample 1080p.mov")).toBeNull();
  });

  it("searches confirmed fields and removes poster and details after the last copy disappears", async () => {
    const { db, rootId } = newDb();
    try {
      const id = insertFile(db, rootId, {
        relPath: sample,
        contentHash: "same",
      });
      const copy = insertFile(db, rootId, {
        relPath: "Other name.mkv",
        contentHash: "same",
      });
      const scope = (q: string) =>
        searchFiles(db, { q }).items.map((row) => row.id);
      expect(scope("has:film-candidate")).toEqual([id]);
      expect(scope("has:film")).toEqual([]);
      const target = getFilmRow(db, "workspace", id)!;
      expect(writeFilm(db, target, details, poster)).toBe(true);
      expect(scope("has:film-candidate")).toEqual([]);
      expect(scope('film:"Alex Rivera" film:Thriller').sort()).toEqual([
        id,
        copy,
      ]);
      expect(scope("film:unknown")).toEqual([]);
      expect(getFilmPoster(db, copy)).toEqual(poster);

      await syncFiles(db, rootId, [], undefined, undefined, [sample]);
      expect(getFilm(db, id)).toBeNull();
      expect(getFilm(db, copy)).toMatchObject(details);
      await syncFiles(db, rootId, [], undefined, undefined, ["Other name.mkv"]);
      expect(getFilm(db, copy)).toBeNull();
      expect(db.prepare("SELECT * FROM film_metadata").all()).toEqual([]);
      expect(writeFilm(db, target, details, poster)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("survives indexing again, preserves unreadable files, and clears mismatched contents", async () => {
    const { db, rootId } = newDb();
    try {
      const relPath = `Unreadable/${sample}`;
      const id = insertFile(db, rootId, { relPath, contentHash: null });
      const before = getFilmRow(db, "workspace", id)!;
      expect(writeFilm(db, before, details, poster)).toBe(true);
      db.prepare("UPDATE files SET content_hash = ? WHERE id = ?").run(
        "film",
        id,
      );
      migrateMetaKey(db, before.metaKey, "film");
      db.prepare("DELETE FROM files WHERE id = ?").run(id);
      const reindexed = insertFile(db, rootId, {
        relPath,
        contentHash: "film",
      });
      pruneOrphanMeta(db);
      expect(getFilm(db, reindexed)).toMatchObject(details);
      await syncFiles(
        db,
        rootId,
        [],
        undefined,
        undefined,
        undefined,
        undefined,
        ["Unreadable"],
      );
      expect(getFilm(db, reindexed)).toMatchObject(details);
      db.prepare("UPDATE files SET content_hash = ? WHERE id = ?").run(
        "different",
        reindexed,
      );
      expect(db.prepare("SELECT * FROM film_metadata").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe("manual OMDb lookup", () => {
  it("extracts only the key from the sample API URL and rejects unrelated links", () => {
    expect(
      omdbKeyFromUrl(" http://www.omdbapi.com/?i=tt3896198&apikey=demo123 "),
    ).toBe("demo123");
    expect(
      omdbKeyFromUrl("https://omdbapi.com/?apikey=Demo123&plot=full"),
    ).toBe("Demo123");
    for (const url of [
      "https://www.omdbapi.com/apikey.aspx?VERIFYKEY=demo123",
      "https://www.omdbapi.com/?apikey=first&apikey=second",
      "https://www.omdbapi.com/?apikey=bad%20key",
      "https://www.omdbapi.com/?apikey=",
      "https://www.omdbapi.com@another.example/?apikey=demo123",
      "https://www.omdbapi.com.another.example/?apikey=demo123",
      "ftp://www.omdbapi.com/?apikey=demo123",
    ])
      expect(omdbKeyFromUrl(url)).toBeNull();
  });

  const record = {
    imdbID: details.imdbId,
    Title: "A City at Night",
    Year: "2025",
    Type: "movie",
    Genre: "Drama, Thriller",
    Director: "Alex Rivera",
    Actors: "Morgan Lee",
    Plot: "A village near the border.",
    Runtime: "157 min",
    Rated: "N/A",
  };

  it("sends title and year, only offers movies, and only downloads the selected title’s poster", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        Search: [record, { ...record, Type: "series" }],
      }),
    );
    await expect(
      lookupFilms("test-key", { text: "A City at Night", year: 2025 }, request),
    ).resolves.toEqual([
      { imdbId: details.imdbId, title: "A City at Night", year: 2025 },
    ]);
    const lookup = request.mock.calls[0][0] as URL;
    expect(lookup.origin).toBe("https://www.omdbapi.com");
    expect(lookup.searchParams.get("s")).toBe("A City at Night");
    expect(lookup.searchParams.get("y")).toBe("2025");

    request
      .mockResolvedValueOnce(
        Response.json({
          ...record,
          Poster: "https://m.media-amazon.com/images/poster.jpg",
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          new Uint8Array(
            readFileSync(
              new URL("../../../e2e/fixtures/media/test.png", import.meta.url),
            ),
          ),
          { headers: { "Content-Type": "image/png" } },
        ),
      );
    const normalize = vi.fn().mockResolvedValue(Buffer.from([255, 216, 255]));
    const result = await loadFilm(
      "test-key",
      details.imdbId,
      normalize,
      request,
    );
    expect(result).toMatchObject({
      film: details,
      poster: { type: "image/jpeg" },
    });
    expect(result.poster?.bytes.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    expect(normalize).toHaveBeenCalledWith(expect.any(Buffer), "image/png");
    expect(request.mock.calls[2][1]).toMatchObject({ redirect: "error" });
    expect((request.mock.calls[2][0] as URL).searchParams.has("apikey")).toBe(
      false,
    );
    request.mockResolvedValueOnce(
      Response.json({
        ...record,
        Poster: "https://127.0.0.1/private",
      }),
    );
    await expect(
      loadFilm("test-key", details.imdbId, normalize, request),
    ).resolves.toMatchObject({ film: details, poster: undefined });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["text/html", "<script>alert(1)</script>"],
    ["image/png", "<svg onload='alert(1)'/>"],
    ["image/jpeg", Uint8Array.from([255, 216, 255, 1])],
  ])(
    "keeps film details but rejects invalid poster bytes labeled %s",
    async (type, body) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({
            ...record,
            Poster: "https://m.media-amazon.com/images/poster.jpg",
          }),
        )
        .mockResolvedValueOnce(
          new Response(body, { headers: { "Content-Type": type } }),
        );
      await expect(
        loadFilm(
          "test-key",
          details.imdbId,
          () => Promise.resolve(undefined),
          request,
        ),
      ).resolves.toMatchObject({ film: details, poster: undefined });
    },
  );

  it("skips malformed search results without interpreting their fields", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        Search: [{ ...record, Year: { toString: null } }, record],
      }),
    );
    await expect(
      lookupFilms("test-key", { text: record.Title }, request),
    ).resolves.toEqual([
      { imdbId: details.imdbId, title: record.Title, year: 2025 },
    ]);
  });

  it("does not reveal a credential when a request fails", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("test-key"));
    await expect(
      lookupFilms("test-key", { text: "A City at Night" }, request),
    ).rejects.toThrow("Could not reach OMDb");
  });
});
