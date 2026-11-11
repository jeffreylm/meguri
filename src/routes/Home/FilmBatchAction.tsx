import { useState } from "react";
import { Clapperboard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { FilmInfoDialog } from "@/components/FilmInfoDialog";
import { useSelection } from "@/components/SelectionContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/ipc/client";
import { bulkTargets } from "@/lib/bulkEdit";
import { MAX_BULK_FILES } from "@shared/tags";
import { FILM_BATCH_SIZE } from "@shared/filmMetadata";
import type { ChannelInput } from "@shared/ipc/channels";
import type { SearchQuery } from "@/ipc/types";

type Scope = ChannelInput<"film_candidates">;

export function FilmBatchAction({ query }: { query: SearchQuery }) {
  const { t } = useI18n();
  const selection = useSelection();
  const [scope, setScope] = useState<Scope | null>(null);
  const candidates = useQuery({
    queryKey: ["film_candidates", scope],
    queryFn: () => api.filmCandidates(scope!),
    enabled: scope !== null,
    gcTime: 0,
  });
  const videos = selection.rows.filter((row) => row.kind === "video");
  const close = () => setScope(null);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        aria-label={t("film.batch")}
        title={t("film.batch")}
        disabled={
          selection.pending ||
          videos.length > MAX_BULK_FILES ||
          (selection.count > 0 && videos.length === 0)
        }
        onClick={() =>
          setScope(videos.length ? { targets: bulkTargets(videos) } : { query })
        }
      >
        <Clapperboard aria-hidden />
        <span className="hidden lg:inline">{t("film.batch")}</span>
      </Button>
      {scope &&
        (candidates.data?.rows.length ? (
          <FilmInfoDialog
            key={JSON.stringify(scope)}
            rows={candidates.data.rows}
            batch
            onClose={close}
            pageNotice={
              candidates.data.more
                ? t("film.batchLimit", { count: FILM_BATCH_SIZE })
                : undefined
            }
            onNext={
              candidates.data.more
                ? () => {
                    if ("query" in scope)
                      setScope({
                        query: {
                          ...scope.query,
                          cursor: candidates.data.next ?? undefined,
                        },
                      });
                    else
                      setScope({
                        ...scope,
                        offset: candidates.data.nextOffset,
                      });
                  }
                : undefined
            }
          />
        ) : (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) close();
            }}
          >
            <DialogContent className="space-y-3 p-5">
              <DialogTitle>{t("film.batch")}</DialogTitle>
              <DialogDescription>
                {t(
                  candidates.isPending
                    ? "folder.loading"
                    : candidates.isError
                      ? "film.readFailed"
                      : "film.noCandidates",
                )}
              </DialogDescription>
            </DialogContent>
          </Dialog>
        ))}
    </>
  );
}
