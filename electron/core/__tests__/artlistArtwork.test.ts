import { describe, expect, it } from "vitest";
import { matchArtlistArtwork, parseArtlistPage } from "../artlistArtwork.js";

const cover = "https://artlist-albums.imgix.net/images/album.jpg?w=384";
const song = {
  songId: "12345",
  title: "M.O.V.E - Instrumental version",
  artists: ["Vader"],
  durationSeconds: 189,
  cover,
};

describe("Artlist artwork matching", () => {
  it("matches original download names and keeps alternate versions distinct", () => {
    const matches = matchArtlistArtwork(
      [
        {
          path: "Vader - MOVE - Instrumental version.wav",
          duration: 188.35,
          contentHash: "a",
        },
        {
          path: "MOVE - Instrumental version by Vader Artlist.wav",
          duration: 189,
          contentHash: "b",
        },
        { path: "Vader - MOVE.wav", duration: 189, contentHash: "c" },
        {
          path: "Folder/Vader - MOVE - Instrumental version.wav",
          duration: 181,
          contentHash: "d",
        },
      ],
      [song],
    );
    expect(matches.ambiguous).toBe(0);
    expect(
      matches.albums.get(cover)?.map((track) => track.contentHash),
    ).toEqual(["a", "b"]);
  });

  it("rejects ambiguous track IDs and non-Artlist image links", () => {
    const page = parseArtlistPage({
      top: 0,
      height: 1000,
      viewport: 600,
      rows: [
        song,
        { ...song, songId: "54321" },
        {
          ...song,
          cover: "https://artlist-albums.imgix.net.example.org/images/fake.jpg",
        },
      ],
    });
    expect(page.rows).toHaveLength(2);
    const result = matchArtlistArtwork(
      [
        {
          path: "Vader - MOVE - Instrumental version.wav",
          duration: 189,
          contentHash: "a",
        },
      ],
      page.rows,
    );
    expect(result.ambiguous).toBe(1);
    expect(result.albums.size).toBe(0);
  });
});
