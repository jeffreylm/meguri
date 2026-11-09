import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, ImageOff } from "lucide-react";
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
import { useAppStatus } from "@/hooks/useAppStatus";
import { thumbUrl } from "@/lib/thumbUrl";
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

function ReviewThumbnail({
  label,
  src,
  fallbackSrc,
  emptyText,
}: {
  label: string;
  src: string | null;
  fallbackSrc?: string;
  emptyText?: string;
}) {
  const { t } = useI18n();
  const [errors, setErrors] = useState(0);
  const image = errors === 0 ? src : errors === 1 ? fallbackSrc : null;
  return (
    <figure className="min-w-0 space-y-1">
      <figcaption className="text-xs font-semibold text-fg">{label}</figcaption>
      <div className="flex h-24 items-center justify-center overflow-hidden rounded-md border border-border bg-overlay sm:h-32">
        {image ? (
          <img
            key={image}
            src={image}
            alt={label}
            className="h-full w-full object-contain"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setErrors((count) => count + 1)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 px-2 text-center text-xs text-muted">
            <ImageOff aria-hidden className="size-4" />
            {src
              ? t("source.previewUnavailable")
              : (emptyText ?? t("source.previewUnavailable"))}
          </div>
        )}
      </div>
    </figure>
  );
}

export function PexelsSourceReview({
  scope,
  thumbVersion,
  onClose,
}: {
  scope: Scope;
  thumbVersion?: Readonly<Record<string, number>>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ key: string; url: string } | null>(
    null,
  );
  const [previewedDrafts, setPreviewedDrafts] = useState<
    Record<string, string>
  >({});
  const mediaBase = useAppStatus().data?.mediaBase ?? "";
  const review = useQuery({
    queryKey: [PEXELS_SOURCE_QUERY, scope],
    queryFn: () => api.previewPexelsSources(scope),
  });
  const rows = review.data?.rows ?? [];
  const global = "globalQuery" in scope;
  const acrossWorkspaces = new Set(rows.map((row) => row.workspaceId)).size > 1;
  const scopeHint =
    "folder" in scope
      ? "source.folderHint"
      : global
        ? "source.globalHint"
        : "source.selectionHint";
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
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [PEXELS_SOURCE_QUERY] });
      setDrafts({});
      setPreviewedDrafts({});
    },
  });
  const changeSource = useMutation({
    mutationFn: async (edit: ChannelInput<"pexels_source_set">) => {
      if (!(await api.setPexelsSource(edit))) {
        throw new Error("The clip changed while editing its source");
      }
      return edit.source;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [PEXELS_SOURCE_QUERY] });
      setEditing(null);
    },
  });
  const pending = save.isPending || changeSource.isPending;
  const activeEdit = rows.some(
    (row) => row.saved && rowKey(row) === editing?.key,
  )
    ? editing
    : null;

  const lastPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = rows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent
        data-source-review
        className="flex max-h-[90dvh] w-[min(48rem,calc(100%-2rem))] max-w-none flex-col gap-4 p-5"
      >
        <DialogHeader className="pr-6">
          <DialogTitle>{t("source.recover")}</DialogTitle>
          <DialogDescription>
            {t("source.reviewHint")} {t(scopeHint)}
          </DialogDescription>
        </DialogHeader>
        {review.isPending && <p role="status">{t("folder.loading")}</p>}
        {review.isError && <p role="alert">{t("source.readFailed")}</p>}
        {review.data?.overLimit && (
          <p role="status">
            {t(global ? "source.globalOverLimit" : "source.overLimit")}
          </p>
        )}
        {review.isSuccess && !review.data.overLimit && rows.length === 0 && (
          <p role="status">{t("source.noVideos")}</p>
        )}
        {suggestions.length > 0 && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
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
              const { saved, suggestion } = row;
              const rowEdit = activeEdit?.key === key ? activeEdit : null;
              const inputUrl = rowEdit?.url ?? value;
              const inputSource = parsePexelsVideoUrl(inputUrl);
              const manualSource =
                previewedDrafts[key] === inputUrl ? inputSource : null;
              const source = manualSource ?? saved ?? suggestion;
              const target = {
                id: row.id,
                workspaceId: row.workspaceId,
                metaKey: row.metaKey,
              };
              const localPreview = thumbUrl(
                mediaBase,
                row.workspaceId,
                row.id,
                thumbVersion?.[`${row.workspaceId}:${row.id}`] ??
                  thumbVersion?.[row.id] ??
                  0,
              );
              // Pexels publishes poster and scene images at these CDN paths.
              // Use only a validated upload ID, never a pasted URL as an image source.
              const pexelsBase = source
                ? `https://images.pexels.com/videos/${source.videoId}`
                : null;
              const label = acrossWorkspaces
                ? `${workspaceLabels.get(row.workspaceId) ?? row.workspaceId} / ${row.relPath}`
                : row.relPath;
              return (
                <li key={key} className="space-y-2 px-3 py-2.5">
                  <div title={label} className="break-all text-sm font-medium">
                    {label}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <ReviewThumbnail
                      key={localPreview ?? "local"}
                      label={t("source.libraryPreview")}
                      src={localPreview}
                    />
                    <ReviewThumbnail
                      key={source?.videoId ?? "source"}
                      label={t("source.pexelsPreview")}
                      src={
                        pexelsBase
                          ? `${pexelsBase}/free-video-${source?.videoId}.jpg?auto=compress&w=480`
                          : null
                      }
                      fallbackSrc={
                        pexelsBase
                          ? `${pexelsBase}/pictures/preview-0.jpg?w=480`
                          : undefined
                      }
                      emptyText={t("source.previewNeedsLink")}
                    />
                  </div>
                  <div
                    className={
                      suggestion
                        ? "grid grid-cols-2 items-start gap-3"
                        : "flex flex-wrap items-center gap-2"
                    }
                  >
                    {rowEdit ? (
                      <form
                        className="flex w-full flex-wrap items-center gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (
                            inputSource &&
                            inputSource.url !== saved?.url &&
                            !pending
                          ) {
                            changeSource.mutate({
                              ...target,
                              source: inputSource.url,
                            });
                          }
                        }}
                      >
                        <Input
                          aria-label={`${t("source.url")} — ${label}`}
                          aria-invalid={!!inputUrl.trim() && !inputSource}
                          value={inputUrl}
                          inputMode="url"
                          autoComplete="off"
                          maxLength={MAX_SOURCE_URL}
                          autoFocus
                          disabled={pending}
                          className="min-w-48 flex-1"
                          onBlur={() =>
                            setPreviewedDrafts((current) => ({
                              ...current,
                              [key]: inputUrl,
                            }))
                          }
                          onChange={(event) =>
                            setEditing({ key, url: event.currentTarget.value })
                          }
                        />
                        <Button
                          type="submit"
                          size="sm"
                          disabled={
                            pending ||
                            !inputSource ||
                            inputSource.url === saved?.url
                          }
                        >
                          {t("smartCollection.save")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            changeSource.reset();
                            setEditing(null);
                          }}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            changeSource.mutate({ ...target, source: null })
                          }
                        >
                          {t("source.remove")}
                        </Button>
                        {!!inputUrl.trim() && !inputSource && (
                          <p role="alert" className="w-full text-sm">
                            {t("source.invalid")}
                          </p>
                        )}
                      </form>
                    ) : saved ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 text-sm text-fg">
                          <Check aria-hidden className="size-4 text-primary" />
                          {t("source.alreadySaved")} · Pexels {saved.videoId}
                        </span>
                        <OpenPexelsSource url={saved.url} />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending || !!activeEdit}
                          onClick={() => {
                            save.reset();
                            changeSource.reset();
                            setEditing({ key, url: saved.url });
                          }}
                        >
                          {t("source.edit")}
                        </Button>
                      </>
                    ) : suggestion ? (
                      <>
                        <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-medium text-fg">
                          <input
                            type="checkbox"
                            checked={!!value}
                            aria-label={`${t("source.saveThisLink")} — ${label}`}
                            disabled={pending}
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
                          {t("source.saveThisLink")}
                        </label>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs text-muted">
                            {t("source.suggested")} · Pexels{" "}
                            {suggestion.videoId}
                          </span>
                          <OpenPexelsSource url={suggestion.url} />
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-muted">
                          {t("source.unknown")}
                        </span>
                        <Input
                          aria-label={`${t("source.url")} — ${label}`}
                          aria-invalid={!!value.trim() && !inputSource}
                          placeholder={t("source.paste")}
                          value={value}
                          inputMode="url"
                          autoComplete="off"
                          maxLength={MAX_SOURCE_URL}
                          disabled={pending}
                          className="min-w-48 flex-1"
                          onBlur={() =>
                            setPreviewedDrafts((current) => ({
                              ...current,
                              [key]: value,
                            }))
                          }
                          onChange={(event) => {
                            const next = event.currentTarget.value;
                            setDrafts((current) => ({
                              ...current,
                              [key]: next,
                            }));
                          }}
                        />
                        {manualSource && (
                          <OpenPexelsSource url={manualSource.url} />
                        )}
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
              disabled={currentPage === 0 || pending || !!activeEdit}
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
              disabled={currentPage === lastPage || pending || !!activeEdit}
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
        {(save.isError || changeSource.isError) && (
          <p role="alert" className="text-sm">
            {t("source.saveFailed")}
          </p>
        )}
        {save.isSuccess && (
          <p role="status" className="text-sm text-fg">
            {save.data.skipped
              ? t("source.skipped", save.data)
              : t("source.savedCount", { count: save.data.saved })}
          </p>
        )}
        {changeSource.isSuccess && (
          <p role="status" className="text-sm text-fg">
            {t(changeSource.data ? "source.updated" : "source.removed")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {t(edits.length || activeEdit ? "common.cancel" : "common.close")}
          </Button>
          <Button
            disabled={invalid || edits.length === 0 || pending || !!activeEdit}
            onClick={() => {
              changeSource.reset();
              save.mutate(edits);
            }}
          >
            {t("source.saveLinks", { count: edits.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
