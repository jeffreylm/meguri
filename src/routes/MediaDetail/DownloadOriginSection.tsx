import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/ipc/client";
import {
  MAX_ASSET_ID,
  MAX_ORIGIN_HOST,
  MAX_ORIGIN_URL,
  recordedSourceWebsite,
  searchSourceId,
  sourcePageById,
  sourceWebsite,
  sourceWebUrl,
  type SavedDownloadSource,
} from "@shared/downloadOrigin";

export function DownloadOriginSection({
  id,
  workspaceId,
  kind,
}: {
  id: number;
  workspaceId: string;
  kind: string;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<
    (SavedDownloadSource & { metaKey: string }) | null
  >(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const queryKey = ["download_origin", workspaceId, id];
  const query = useQuery({
    queryKey,
    queryFn: () => api.downloadOrigin(id, workspaceId),
    retry: false,
    staleTime: 60_000,
  });
  const origin = query.data;
  const saved = origin?.saved;
  const website =
    saved?.website ||
    sourceWebUrl(saved?.url ?? "")?.hostname ||
    recordedSourceWebsite(origin?.urls ?? []);

  const save = useMutation({
    meta: { reportsOwnError: true },
    mutationFn: ({
      metaKey,
      source,
    }: {
      metaKey: string;
      source: SavedDownloadSource | null;
    }) => api.saveDownloadOrigin({ id, workspaceId, metaKey, source }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      setDraft(null);
    },
  });

  function edit() {
    if (!origin || draft) return;
    save.reset();
    setDraft({
      metaKey: origin.metaKey,
      website,
      url: saved?.url ?? "",
      assetId: saved?.assetId ?? "",
    });
  }

  function open(url: string) {
    const target = sourceWebUrl(url);
    if (!target) return;
    void api
      .openUrl(target.href)
      .catch(() => toast.error(t("origin.openFailed")));
  }

  function search(url: string) {
    edit();
    urlInput.current?.focus();
    open(url);
  }

  function copy(value: string) {
    void navigator.clipboard.writeText(value).then(
      () => toast.success(t("origin.copied")),
      () => toast.error(t("origin.copyFailed")),
    );
  }

  const siteValue = draft?.website.trim() ?? "";
  const urlValue = draft?.url.trim() ?? "";
  const site = sourceWebsite(draft ? siteValue : website);
  const page = sourceWebUrl(urlValue);
  const invalidSite = Boolean(siteValue && !site);
  const invalidUrl = Boolean(urlValue && !page);
  const idSite = site?.hostname ?? page?.hostname ?? "";
  const idValue = draft?.assetId.trim() ?? "";
  const candidate = sourcePageById(idSite, idValue, kind);
  const idSearch = candidate ?? searchSourceId(idSite, idValue);

  if (query.isPending) return null;

  return (
    <section
      aria-label={t("origin.title")}
      className="space-y-2 rounded-lg border border-border bg-surface p-3"
    >
      <h2 className="text-sm font-semibold text-bright-fg">
        {t("origin.title")}
      </h2>
      {query.isError && (
        <p role="alert" className="text-sm">
          {t("origin.readFailed")}
        </p>
      )}
      {origin && !draft && (
        <>
          {website && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{t("origin.website")}</span>
              <span className="break-all text-fg">{website}</span>
              {site && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => search(site.href)}
                >
                  {t("origin.searchWebsite")}
                </Button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {saved?.url ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => open(saved.url)}
                >
                  {t("origin.openOriginal")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copy(saved.url)}
                >
                  {t("origin.copy")}
                </Button>
              </>
            ) : (
              <span className="text-sm text-muted">
                {t("origin.noOriginal")}
              </span>
            )}
            {saved?.assetId && (
              <span className="break-all text-xs text-muted">
                {t("origin.savedId", { id: saved.assetId })}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={edit}>
              {t(saved ? "source.edit" : "source.add")}
            </Button>
          </div>
        </>
      )}
      {draft && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (invalidSite || invalidUrl || (!site && !page) || save.isPending)
              return;
            save.mutate({
              metaKey: draft.metaKey,
              source: {
                website: site?.hostname ?? page?.hostname ?? "",
                url: page?.href ?? "",
                assetId: idValue,
              },
            });
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-40 flex-1 space-y-1 text-sm">
              <span>{t("origin.website")}</span>
              <Input
                value={draft.website}
                aria-invalid={invalidSite}
                maxLength={MAX_ORIGIN_HOST}
                disabled={save.isPending}
                onChange={(event) =>
                  setDraft({ ...draft, website: event.currentTarget.value })
                }
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!site}
              onClick={() => site && search(site.href)}
            >
              {t("origin.searchWebsite")}
            </Button>
          </div>
          <label className="block space-y-1 text-sm">
            <span>{t("origin.originalUrl")}</span>
            <Input
              ref={urlInput}
              autoFocus
              value={draft.url}
              inputMode="url"
              aria-invalid={invalidUrl}
              placeholder="https://…"
              maxLength={MAX_ORIGIN_URL}
              disabled={save.isPending}
              onChange={(event) =>
                setDraft({ ...draft, url: event.currentTarget.value })
              }
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-40 flex-1 space-y-1 text-sm">
              <span>{t("origin.assetId")}</span>
              <Input
                value={draft.assetId}
                maxLength={MAX_ASSET_ID}
                disabled={save.isPending}
                onChange={(event) =>
                  setDraft({ ...draft, assetId: event.currentTarget.value })
                }
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!idSearch}
              onClick={() => idSearch && search(idSearch)}
            >
              {t(candidate ? "origin.openSuggestion" : "origin.searchId")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!idValue}
              onClick={() => copy(idValue)}
            >
              {t("origin.copy")}
            </Button>
          </div>
          {candidate && (
            <p className="text-xs text-muted">
              {t("origin.confirmSuggestion")}
            </p>
          )}
          {(invalidSite || invalidUrl) && (
            <p role="alert" className="text-sm">
              {t(invalidSite ? "origin.invalidWebsite" : "origin.invalidUrl")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              type="submit"
              disabled={
                invalidSite || invalidUrl || (!site && !page) || save.isPending
              }
            >
              {t("smartCollection.save")}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => {
                save.reset();
                setDraft(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            {saved && (
              <Button
                size="sm"
                type="button"
                variant="ghost"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({ metaKey: draft.metaKey, source: null })
                }
              >
                {t("source.remove")}
              </Button>
            )}
          </div>
          {save.isError && (
            <p role="alert" className="text-sm">
              {t("source.saveFailed")}
            </p>
          )}
        </form>
      )}
      {origin && origin.urls.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">
            {t("origin.recordedUrls")}
          </summary>
          <ul className="space-y-2 pt-2">
            {origin.urls.map((url) => (
              <li key={url} className="space-y-1">
                <span className="block break-all text-xs text-fg">{url}</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => search(url)}
                  >
                    {t("origin.openRecorded")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => copy(url)}>
                    {t("origin.copy")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
