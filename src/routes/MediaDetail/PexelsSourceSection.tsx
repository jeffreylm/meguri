import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  OpenPexelsSource,
  PEXELS_SOURCE_QUERY,
} from "@/components/PexelsSourceReview";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/ipc/client";
import { MAX_SOURCE_URL, parsePexelsVideoUrl } from "@shared/pexelsSource";

export function PexelsSourceSection({
  id,
  workspaceId,
}: {
  id: number;
  workspaceId: string;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<{ metaKey: string; url: string } | null>(
    null,
  );
  const scope = { targets: [{ workspaceId, fileIds: [id] }] };
  const queryKey = [PEXELS_SOURCE_QUERY, scope];
  const query = useQuery({
    queryKey,
    queryFn: () => api.previewPexelsSources(scope),
  });
  const row = query.data?.rows[0];
  const suggestion = row?.suggestion;
  const edit = useMutation({
    mutationFn: async (source: string | null) => {
      if (
        !draft ||
        !(await api.setPexelsSource({
          id,
          workspaceId,
          metaKey: draft.metaKey,
          source,
        }))
      ) {
        throw new Error("The clip changed while editing its source");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [PEXELS_SOURCE_QUERY] });
      setDraft(null);
    },
  });
  const value = draft?.url.trim() ?? "";
  const invalid = !!value && !parsePexelsVideoUrl(value);

  return (
    <section
      aria-label={t("source.title")}
      className="space-y-2 rounded-lg border border-border bg-surface p-3"
    >
      <h2 className="text-sm font-semibold text-bright-fg">
        {t("source.title")}
      </h2>
      {query.isPending && (
        <p role="status" className="text-sm text-muted">
          {t("folder.loading")}
        </p>
      )}
      {(query.isError || (query.isSuccess && !row)) && (
        <p role="alert" className="text-sm">
          {t("source.readFailed")}
        </p>
      )}
      {row &&
        (draft === null ? (
          <div className="flex flex-wrap items-center gap-2">
            {row.saved ? (
              <>
                <span title={row.saved.url} className="text-sm text-fg">
                  Pexels · {row.saved.videoId}
                </span>
                <OpenPexelsSource url={row.saved.url} />
              </>
            ) : (
              <span className="text-sm text-muted">{t("source.unknown")}</span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                edit.reset();
                setDraft({ metaKey: row.metaKey, url: row.saved?.url ?? "" });
              }}
            >
              {t(row.saved ? "source.edit" : "source.add")}
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (value && !invalid && !edit.isPending) edit.mutate(value);
            }}
          >
            <Input
              aria-label={t("source.url")}
              aria-invalid={invalid}
              placeholder={t("source.paste")}
              autoFocus
              inputMode="url"
              autoComplete="off"
              value={draft.url}
              maxLength={MAX_SOURCE_URL}
              className="min-w-48 flex-1"
              disabled={edit.isPending}
              onChange={(event) =>
                setDraft({ ...draft, url: event.currentTarget.value })
              }
            />
            {suggestion && !value && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDraft({ ...draft, url: suggestion.url })}
              >
                {t("source.useSuggestion")}
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={!value || invalid || edit.isPending}
            >
              {t("smartCollection.save")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={edit.isPending}
              onClick={() => {
                edit.reset();
                setDraft(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            {row.saved && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={edit.isPending}
                onClick={() => edit.mutate(null)}
              >
                {t("source.remove")}
              </Button>
            )}
          </form>
        ))}
      {invalid && (
        <p role="alert" className="text-sm">
          {t("source.invalid")}
        </p>
      )}
      {edit.isError && (
        <p role="alert" className="text-sm">
          {t("source.saveFailed")}
        </p>
      )}
    </section>
  );
}
