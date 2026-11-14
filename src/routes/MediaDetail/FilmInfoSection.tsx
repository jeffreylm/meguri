import { Clapperboard, ExternalLink } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilmInfoDialog } from "@/components/FilmInfoDialog";
import { refreshFilm } from "@/lib/filmLookup";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/ipc/client";
import { filmPosterUrl } from "@/lib/thumbUrl";
import type { FilmReviewRow } from "@shared/filmMetadata";

export function FilmInfoSection({
  workspaceId,
  id,
  mediaBase,
  open,
  onOpen,
  data,
}: {
  workspaceId: string;
  id: number;
  mediaBase: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  data: Awaited<ReturnType<typeof api.getFilm>>;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const remove = useMutation({
    meta: { reportsOwnError: true },
    mutationFn: async (row: FilmReviewRow) => {
      if (!(await api.removeFilm({ workspaceId, id, metaKey: row.metaKey })))
        throw new Error("This file changed.");
      refreshFilm(qc, row);
    },
  });
  if (!data) return null;
  const { row, film } = data;
  const poster = filmPosterUrl(mediaBase, workspaceId, id, film?.posterVersion);
  return (
    <section
      aria-label={t("film.title")}
      className="space-y-3 rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-bright-fg">
          {t("film.title")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {(film?.wikidataId || film?.imdbId) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void api
                  .openUrl(
                    film.wikidataId
                      ? `https://www.wikidata.org/wiki/${film.wikidataId}`
                      : `https://www.imdb.com/title/${film.imdbId}/`,
                  )
                  .catch(() => {});
              }}
            >
              <ExternalLink aria-hidden />{" "}
              {film.wikidataId ? "Wikidata" : "IMDb"}
            </Button>
          )}
          <Button
            size="sm"
            variant={row.guess && !film ? "default" : "outline"}
            onClick={() => onOpen(true)}
          >
            <Clapperboard aria-hidden />{" "}
            {t(film ? "film.change" : row.guess ? "film.get" : "film.add")}
          </Button>
          {film && (
            <Button
              size="sm"
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => remove.mutate(row)}
            >
              {t("film.remove")}
            </Button>
          )}
        </div>
      </div>
      {film ? (
        <div className="flex gap-3">
          {poster && (
            <img
              src={poster}
              alt=""
              className="max-h-52 w-24 shrink-0 rounded object-contain object-top"
            />
          )}
          <div className="min-w-0 space-y-1 text-sm">
            <h3 className="font-semibold text-bright-fg">
              {film.title} ({film.year})
            </h3>
            <p>
              {[
                film.genres,
                film.runtime,
                film.certificate,
                film.imdbRating && `IMDb ${film.imdbRating}/10`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {film.directors && (
              <p>{t("film.directors", { names: film.directors })}</p>
            )}
            {film.cast && <p>{t("film.cast", { names: film.cast })}</p>}
            {film.plot && <p className="text-muted">{film.plot}</p>}
            <p className="text-xs text-muted">
              {film.wikidataId ? "Wikidata" : t("film.attribution")}
            </p>
          </div>
        </div>
      ) : (
        row.guess && (
          <p className="text-sm text-muted">
            {t("film.detected", {
              title: row.guess.title,
              year: row.guess.year ?? "",
            })}
          </p>
        )
      )}
      {remove.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("film.removeFailed")}
        </p>
      )}
      {open && (
        <FilmInfoDialog
          rows={[
            film
              ? { ...row, guess: { title: film.title, year: film.year } }
              : row,
          ]}
          onClose={() => onOpen(false)}
        />
      )}
    </section>
  );
}
