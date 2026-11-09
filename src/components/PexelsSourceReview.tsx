import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/ipc/client";
import type { ChannelInput } from "@shared/ipc/channels";
import {
  MAX_SOURCE_URL,
  parsePexelsVideoUrl,
  type SourceReviewRow,
} from "@shared/pexelsSource";

export const PEXELS_SOURCE_QUERY = "pexels_sources_preview";

type Scope = ChannelInput<"pexels_sources_preview">;
const PAGE_SIZE = 40;
const rowKey = ({ workspaceId, id, metaKey }: SourceReviewRow) =>
  JSON.stringify([workspaceId, id, metaKey]);

export function OpenPexelsSource({ url }: { url: string }) {
  const { t } = useI18n();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="shrink-0"
      onClick={() =>
        void api.openUrl(url).catch(() => toast.error(t("source.openFailed")))
      }
    >
      <ExternalLink aria-hidden />
      {t("source.open")}
    </Button>
  );
}

export function PexelsSourceReview({
  scope,
  onClose,
}: {
  scope: Scope;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const review = useQuery({
    queryKey: [PEXELS_SOURCE_QUERY, scope],
    queryFn: () => api.previewPexelsSources(scope),
  });
  const acrossWorkspaces = "targets" in scope && scope.targets.length > 1;
  const workspaces = useQuery({
    queryKey: ["workspaces_list"],
    queryFn: api.workspacesList,
    enabled: acrossWorkspaces,
  });
  const workspaceLabels = new Map(
    workspaces.data?.workspaces.map((workspace) => [
      workspace.id,
      workspace.label,
    ]),
  );
  const rows = review.data?.rows ?? [];
  const suggestions = rows.flatMap((row) =>
    row.suggestion ? [{ key: rowKey(row), url: row.suggestion.url }] : [],
  );
  const allSelected = suggestions.every(({ key }) => drafts[key]);
  const edits = rows.flatMap((row) => {
    const { workspaceId, id, metaKey, saved } = row;
    const source = drafts[rowKey(row)]?.trim();
    return !saved && source ? [{ workspaceId, id, metaKey, source }] : [];
  });
  const invalid = edits.some(({ source }) => !parsePexelsVideoUrl(source));
  const save = useMutation({
    mutationFn: api.savePexelsSources,
    onSuccess: ({ saved, skipped }) => {
      void qc.invalidateQueries({ queryKey: [PEXELS_SOURCE_QUERY] });
      if (skipped) toast.info(t("source.skipped", { saved, skipped }));
      else toast.success(t("source.savedCount", { count: saved }));
      onClose();
    },
  });

  const lastPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = rows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent
        data-source-review
        className="flex max-h-[90dvh] w-[min(48rem,calc(100%-2rem))] max-w-none flex-col gap-4 p-5"
      >
        <DialogHeader className="pr-6">
          <DialogTitle>{t("source.recover")}</DialogTitle>
          <DialogDescription>
            {t("source.reviewHint")}
            {"folder" in scope && ` ${t("source.folderHint")}`}
          </DialogDescription>
        </DialogHeader>
        {review.isPending && <p role="status">{t("folder.loading")}</p>}
        {review.isError && <p role="alert">{t("source.readFailed")}</p>}
        {review.data?.overLimit && <p role="status">{t("source.overLimit")}</p>}
        {review.isSuccess && !review.data.overLimit && rows.length === 0 && (
          <p role="status">{t("source.noVideos")}</p>
        )}
        {suggestions.length > 0 && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={save.isPending}
              onClick={() =>
                setDrafts((current) => {
                  const next = { ...current };
                  for (const { key, url } of suggestions) {
                    next[key] = allSelected ? "" : url;
                  }
                  return next;
                })
              }
            >
              {t(
                allSelected
                  ? "source.clearSuggestions"
                  : "source.selectSuggestions",
              )}
            </Button>
          </div>
        )}
        {visible.length > 0 && (
          <ul
            className="min-h-0 divide-y divide-border overflow-y-auto rounded-md border border-border"
            key={currentPage}
          >
            {visible.map((row) => {
              const key = rowKey(row);
              const value = drafts[key] ?? "";
              const suggestion = row.suggestion;
              const label = acrossWorkspaces
                ? `${workspaceLabels.get(row.workspaceId) ?? row.workspaceId} / ${row.relPath}`
                : row.relPath;
              return (
                <li key={key} className="space-y-2 px-3 py-2.5">
                  <div title={label} className="break-all text-sm font-medium">
                    {label}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {row.saved ? (
                      <>
                        <span className="text-sm text-fg">
                          {t("source.alreadySaved")}
                        </span>
                        <OpenPexelsSource url={row.saved.url} />
                      </>
                    ) : suggestion ? (
                      <>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!value}
                            aria-label={`${t("source.suggested")} — ${label}`}
                            disabled={save.isPending}
                            onChange={(event) => {
                              const next = event.currentTarget.checked
                                ? suggestion.url
                                : "";
                              setDrafts((current) => ({
                                ...current,
                                [key]: next,
                              }));
                            }}
                            className="size-4 accent-primary"
                          />
                          {t("source.suggested")} · Pexels {suggestion.videoId}
                        </label>
                        <OpenPexelsSource url={suggestion.url} />
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-muted">
                          {t("source.unknown")}
                        </span>
                        <Input
                          aria-label={`${t("source.url")} — ${label}`}
                          aria-invalid={
                            !!value.trim() && !parsePexelsVideoUrl(value)
                          }
                          placeholder={t("source.paste")}
                          value={value}
                          inputMode="url"
                          autoComplete="off"
                          maxLength={MAX_SOURCE_URL}
                          disabled={save.isPending}
                          className="min-w-48 flex-1"
                          onChange={(event) => {
                            const next = event.currentTarget.value;
                            setDrafts((current) => ({
                              ...current,
                              [key]: next,
                            }));
                          }}
                        />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {lastPage > 0 && (
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              {t("source.previous")}
            </Button>
            <span className="text-sm text-muted">
              {t("source.page", {
                current: currentPage + 1,
                total: lastPage + 1,
              })}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              {t("source.next")}
            </Button>
          </div>
        )}
        {invalid && (
          <p role="alert" className="text-sm">
            {t("source.invalid")}
          </p>
        )}
        {save.isError && (
          <p role="alert" className="text-sm">
            {t("source.saveFailed")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={invalid || edits.length === 0 || save.isPending}
            onClick={() => save.mutate(edits)}
          >
            {t("source.saveLinks", { count: edits.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
