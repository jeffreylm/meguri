import { expect, it, vi } from "vitest";
import { loadWikimediaFilm, lookupWikimediaFilms } from "../wikimediaFilms.js";

const snak = (value: unknown) => ({ mainsnak: { datavalue: { value } } });
const film = {
  id: "Q484442",
  labels: { en: { value: "Spider-Man" } },
  descriptions: { en: { value: "2002 American superhero film" } },
  claims: {
    P31: [snak({ id: "Q11424" })],
    P345: [snak("tt0145487")],
    P577: [snak({ time: "+2002-05-03T00:00:00Z", precision: 11 })],
    P57: [snak({ id: "Q18800" })],
    P2047: [
      snak({ amount: "+121", unit: "http://www.wikidata.org/entity/Q7727" }),
    ],
  },
};

it("finds an English film through Wikipedia and saves Wikidata credits without an API key", async () => {
  const request = vi.fn<typeof fetch>((input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    expect(url.searchParams.has("apikey")).toBe(false);
    if (url.host === "en.wikipedia.org") {
      return Promise.resolve(
        Response.json({
          query: {
            pages: {
              1: { index: 1, pageprops: { wikibase_item: film.id } },
            },
          },
        }),
      );
    }
    const ids = url.searchParams.get("ids");
    if (ids === film.id)
      return Promise.resolve(Response.json({ entities: { [film.id]: film } }));
    expect(ids).toBe("Q18800");
    return Promise.resolve(
      Response.json({
        entities: {
          Q18800: { id: "Q18800", labels: { en: { value: "Sam Raimi" } } },
        },
      }),
    );
  });
  await expect(
    lookupWikimediaFilms({ text: "Spider-Man", year: 2002 }, request),
  ).resolves.toEqual([
    {
      title: "Spider-Man",
      year: 2002,
      imdbId: "tt0145487",
      wikidataId: film.id,
    },
  ]);
  await expect(
    loadWikimediaFilm(film.id, 2002, request),
  ).resolves.toMatchObject({
    wikidataId: film.id,
    directors: "Sam Raimi",
    runtime: "121 min",
    plot: "2002 American superhero film",
  });
});
