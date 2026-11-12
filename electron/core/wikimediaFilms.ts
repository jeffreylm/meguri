import { z } from "zod";
import {
  FilmTitle,
  FilmYear,
  IMDbId,
  WikidataId,
  type FilmMatch,
  type FilmMetadata,
} from "../../shared/filmMetadata.js";
import { imdbIdFromInput, readBounded } from "./omdb.js";

const WIKIPEDIA = "https://en.wikipedia.org/w/api.php";
const WIKIDATA = "https://www.wikidata.org/w/api.php";
const statements = z.record(
  z.string(),
  z.array(
    z.object({
      rank: z.string().optional(),
      mainsnak: z.object({
        datavalue: z.object({ value: z.unknown() }).optional(),
      }),
    }),
  ),
);
const label = z.object({ en: z.object({ value: z.string() }).optional() });
const entitySchema = z.object({
  id: WikidataId,
  labels: label.optional(),
  descriptions: label.optional(),
  claims: statements.optional(),
});
const idValue = z.object({ id: WikidataId });
const dateValue = z.object({ time: z.string(), precision: z.number() });
type Entity = z.infer<typeof entitySchema>;

async function query(
  endpoint: typeof WIKIPEDIA | typeof WIKIDATA,
  parameters: Record<string, string>,
  request: typeof fetch,
) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    ...parameters,
    format: "json",
  }).toString();
  try {
    const response = await request(url, {
      redirect: "error",
      headers: {
        "User-Agent": "FootageDeck/0.1 (https://github.com/jeffreylm/meguri)",
      },
      signal: AbortSignal.timeout(9_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Wikimedia request failed");
    }
    return JSON.parse(
      (await readBounded(response, 1024 * 1024)).toString("utf8"),
    ) as unknown;
  } catch {
    throw new Error("Could not reach Wikimedia. Try again.");
  }
}

function values(entity: Entity, property: string): unknown[] {
  const claims = entity.claims?.[property] ?? [];
  return claims
    .filter(({ rank }) => rank !== "deprecated")
    .sort(
      (a, b) => Number(b.rank === "preferred") - Number(a.rank === "preferred"),
    )
    .map(({ mainsnak }) => mainsnak.datavalue?.value);
}

function ids(entity: Entity, property: string): string[] {
  return values(entity, property).flatMap((value) => {
    const item = idValue.safeParse(value);
    return item.success ? [item.data.id] : [];
  });
}

function filmMatch(entity: Entity, preferredYear?: number): FilmMatch | null {
  const title = FilmTitle.safeParse(entity.labels?.en?.value);
  const years = values(entity, "P577").flatMap((value) => {
    const date = dateValue.safeParse(value);
    const year =
      date.success && date.data.precision >= 9
        ? FilmYear.safeParse(Number(/^\+(\d{4})-/.exec(date.data.time)?.[1]))
        : null;
    return year?.success ? [year.data] : [];
  });
  const year =
    preferredYear !== undefined && years.includes(preferredYear)
      ? preferredYear
      : years[0];
  const imdb = values(entity, "P345").find(
    (value): value is string => IMDbId.safeParse(value).success,
  );
  const types = ids(entity, "P31");
  const isFilm =
    types.some((id) =>
      ["Q11424", "Q24869", "Q93204", "Q202866", "Q226730"].includes(id),
    ) ||
    (imdb &&
      !types.some((id) => ["Q5398426", "Q21191270", "Q24856"].includes(id)) &&
      ids(entity, "P57").length > 0);
  if (!isFilm || !title.success || year === undefined) return null;
  return { title: title.data, year, imdbId: imdb ?? "", wikidataId: entity.id };
}

async function entities(ids: string[], props: string, request: typeof fetch) {
  if (!ids.length) return [];
  const raw = await query(
    WIKIDATA,
    {
      action: "wbgetentities",
      ids: ids.join("|"),
      props,
      languages: "en",
    },
    request,
  );
  const body = z
    .object({ entities: z.record(z.string(), z.unknown()) })
    .parse(raw);
  return ids.flatMap((id) => {
    const parsed = entitySchema.safeParse(body.entities[id]);
    return parsed.success && parsed.data.id === id ? [parsed.data] : [];
  });
}

export async function lookupWikimediaFilms(
  input: { text: string; year?: number },
  request = fetch,
): Promise<FilmMatch[]> {
  const imdb = imdbIdFromInput(input.text);
  const direct = WikidataId.safeParse(input.text);
  let candidates: string[];
  if (direct.success) {
    candidates = [direct.data];
  } else if (imdb) {
    const raw = await query(
      WIKIDATA,
      {
        action: "query",
        list: "search",
        srsearch: `haswbstatement:P345=${imdb}`,
        srlimit: "5",
      },
      request,
    );
    const body = z
      .object({
        query: z
          .object({
            search: z.array(z.object({ title: z.string() })),
          })
          .optional(),
      })
      .parse(raw);
    candidates = body.query?.search.map(({ title }) => title) ?? [];
  } else {
    if (/^https?:\/\//i.test(input.text))
      throw new Error("Enter a film title, IMDb title link or Wikidata ID.");
    const raw = await query(
      WIKIPEDIA,
      {
        action: "query",
        generator: "search",
        gsrnamespace: "0",
        gsrlimit: "8",
        gsrsearch: [input.text, input.year, "film"].filter(Boolean).join(" "),
        prop: "pageprops",
        ppprop: "wikibase_item",
      },
      request,
    );
    const body = z
      .object({
        query: z
          .object({
            pages: z.record(
              z.string(),
              z.object({
                index: z.number().optional(),
                pageprops: z.object({ wikibase_item: z.string() }).optional(),
              }),
            ),
          })
          .optional(),
      })
      .parse(raw);
    candidates = Object.values(body.query?.pages ?? {})
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .flatMap((page) =>
        page.pageprops ? [page.pageprops.wikibase_item] : [],
      );
  }
  const found = await entities(
    [...new Set(candidates.filter((id) => WikidataId.safeParse(id).success))],
    "labels|claims",
    request,
  );
  return found.flatMap((entity) => {
    const match = filmMatch(entity, input.year);
    return match && (!imdb || match.imdbId === imdb) ? [match] : [];
  });
}

export async function loadWikimediaFilm(
  id: string,
  year?: number,
  request = fetch,
): Promise<FilmMetadata> {
  const [entity] = await entities(
    [WikidataId.parse(id)],
    "labels|descriptions|claims",
    request,
  );
  const match = entity && filmMatch(entity, year);
  if (!match) throw new Error("Wikidata could not load this film.");
  const genres = ids(entity, "P136").slice(0, 8);
  const directors = ids(entity, "P57").slice(0, 8);
  const cast = ids(entity, "P161").slice(0, 12);
  const names = new Map(
    (
      await entities(
        [...new Set([...genres, ...directors, ...cast])],
        "labels",
        request,
      )
    ).map((item) => [item.id, item.labels?.en?.value.slice(0, 200)]),
  );
  const join = (items: string[]) =>
    items
      .map((item) => names.get(item))
      .filter(Boolean)
      .join(", ");
  const runtime = values(entity, "P2047").flatMap((value) => {
    const length = z
      .object({ amount: z.string(), unit: z.string() })
      .safeParse(value);
    if (!length.success || !length.data.unit.endsWith("/Q7727")) return [];
    const minutes = Number(length.data.amount);
    return Number.isFinite(minutes) && minutes > 0 ? [minutes] : [];
  })[0];
  return {
    ...match,
    genres: join(genres),
    directors: join(directors),
    cast: join(cast),
    plot: entity.descriptions?.en?.value.slice(0, 1000) ?? "",
    runtime: runtime === undefined ? "" : `${runtime} min`,
    certificate: "",
    imdbRating: "",
  };
}
