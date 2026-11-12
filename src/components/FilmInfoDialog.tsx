import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nProvider";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { api } from "@/ipc/client";
import { fileNameOf } from "@/lib/relPath";
import {
  OmdbKey,
  omdbKeyFromUrl,
  type FilmMatch,
  type FilmReviewRow,
} from "@shared/filmMetadata";
import { refreshFilm } from "@/lib/filmLookup";

const rowKey = (row: FilmReviewRow) => `${row.workspaceId}:${row.id}`;
const matchKey = (match: FilmMatch) => match.wikidataId ?? match.imdbId;
type Stage = {
  text: string;
  year: string;
  checked: boolean;
  results?: FilmMatch[];
  choice?: string;
  saved?: boolean;
};

export function FilmInfoDialog({
  rows,
  batch = false,
  onClose,
  onNext,
  pageNotice,
}: {
  rows: FilmReviewRow[];
  batch?: boolean;
  onClose: () => void;
  onNext?: () => void;
  pageNotice?: string;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [provider, setProvider] = useLocalStorage<"wikimedia" | "omdb">(
    "meguri.filmProvider",
    "wikimedia",
    (raw) => (raw === "omdb" ? "omdb" : "wikimedia"),
  );
  const { data: keyStatus } = useQuery({
    queryKey: ["film_key_status"],
    queryFn: api.filmKeyStatus,
    enabled: provider === "omdb",
  });
  const [credential, setCredential] = useState<{
    field: "key" | "url";
    value: string;
  }>({ field: "key", value: "" });
  const parsedKey = OmdbKey.safeParse(credential.value);
  const key =
    credential.field === "url"
      ? omdbKeyFromUrl(credential.value)
      : parsedKey.success
        ? parsedKey.data
        : null;
  const canLookup =
    provider === "wikimedia" ||
    (credential.value
      ? key !== null
      : keyStatus === "saved" || keyStatus === "session");
  const [busy, setBusy] = useState<"lookup" | "save" | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);
  const [staged, setStaged] = useState<Record<string, Stage>>(() =>
    Object.fromEntries(
      rows.map((row) => [
        rowKey(row),
        {
          text:
            row.guess?.title ?? fileNameOf(row.relPath).replace(/\.[^.]+$/, ""),
          year: row.guess?.year?.toString() ?? "",
          checked: true,
        },
      ]),
    ),
  );
  const setRow = (id: string, update: Partial<Stage>) =>
    setStaged((current) => ({
      ...current,
      [id]: { ...current[id], ...update },
    }));
  const eligible = rows.filter((row) => {
    const item = staged[rowKey(row)];
    return (
      item.checked &&
      !item.saved &&
      item.text.trim() &&
      (!item.year || /^(?:18[789]|19\d|20\d|21\d)\d$/.test(item.year))
    );
  });
  const confirmed = eligible.filter((row) => staged[rowKey(row)].choice);

  async function run(action: "lookup" | "save", work: FilmReviewRow[]) {
    if (!canLookup) return;
    setError("");
    setBusy(action);
    setProgress({ done: 0, total: work.length });
    cancelled.current = false;
    let validated = false;
    try {
      for (const [index, row] of work.entries()) {
        if (cancelled.current) break;
        const id = rowKey(row);
        const stage = staged[id];
        if (action === "lookup") {
          setRow(id, { results: undefined, choice: undefined });
          const results = await api.lookupFilm({
            provider,
            key: provider === "omdb" ? (key ?? undefined) : undefined,
            text: stage.text.trim(),
            year: stage.year ? Number(stage.year) : undefined,
          });
          validated = true;
          if (!cancelled.current) setRow(id, { results });
        } else if (stage.choice) {
          const { workspaceId, metaKey } = row;
          const target = { id: row.id, workspaceId, metaKey };
          const chosen = stage.results?.find(
            (match) => matchKey(match) === stage.choice,
          );
          if (!chosen) continue;
          const film = await api.saveFilm(
            chosen.wikidataId
              ? { ...target, wikidataId: chosen.wikidataId, year: chosen.year }
              : { ...target, imdbId: chosen.imdbId, key: key ?? undefined },
          );
          validated = true;
          refreshFilm(qc, row, film.posterVersion);
          if (!cancelled.current) setRow(id, { saved: true });
        }
        setProgress({ done: index + 1, total: work.length });
      }
    } catch (cause) {
      if (!cancelled.current)
        setError(String(cause).replace(/^.*?Error: /, ""));
    } finally {
      if (provider === "omdb" && key && validated) {
        await qc.invalidateQueries({ queryKey: ["film_key_status"] });
        if (!cancelled.current) setCredential({ field: "key", value: "" });
      }
      setBusy(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] max-w-3xl flex-col gap-4 p-5"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>{t(batch ? "film.batch" : "film.get")}</DialogTitle>
          <DialogDescription>
            {t(
              provider === "wikimedia"
                ? "film.wikimediaHelp"
                : "film.reviewHelp",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            {t("film.provider")}
            <select
              aria-label={t("film.provider")}
              className="rounded border border-border bg-bg px-2 py-1.5 text-fg"
              value={provider}
              disabled={!!busy}
              onChange={(event) => {
                setProvider(
                  event.currentTarget.value === "omdb" ? "omdb" : "wikimedia",
                );
                setError("");
                setStaged((current) =>
                  Object.fromEntries(
                    Object.entries(current).map(([id, row]) => [
                      id,
                      { ...row, results: undefined, choice: undefined },
                    ]),
                  ),
                );
              }}
            >
              <option value="wikimedia">Wikipedia + Wikidata</option>
              <option value="omdb">OMDb</option>
            </select>
          </label>
          {provider === "omdb" && (
            <>
              <label className="block space-y-1 text-sm">
                <span>{t("film.key")}</span>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={credential.field === "key" ? credential.value : ""}
                  maxLength={128}
                  disabled={!!busy}
                  onChange={(e) =>
                    setCredential({
                      field: "key",
                      value: e.currentTarget.value,
                    })
                  }
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{t("film.keyUrl")}</span>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://www.omdbapi.com/?apikey=…"
                  value={credential.field === "url" ? credential.value : ""}
                  maxLength={2048}
                  disabled={!!busy}
                  aria-invalid={
                    credential.field === "url" && !!credential.value && !key
                  }
                  onChange={(e) =>
                    setCredential({
                      field: "url",
                      value: e.currentTarget.value,
                    })
                  }
                />
              </label>
              <p className="text-xs text-muted">{t("film.keyHelp")}</p>
              {!credential.value &&
                (keyStatus === "saved" || keyStatus === "session") && (
                  <p className="text-xs text-muted">
                    {t(
                      keyStatus === "saved"
                        ? "film.keySaved"
                        : "film.keySession",
                    )}
                  </p>
                )}
              {credential.field === "url" && credential.value && !key && (
                <p role="alert" className="text-sm text-destructive">
                  {t("film.keyUrlInvalid")}
                </p>
              )}
            </>
          )}
          <Button
            variant="outline"
            disabled={!canLookup || !!busy || !eligible.length}
            onClick={() => void run("lookup", eligible)}
          >
            {t(batch ? "film.lookupBatch" : "film.lookup")}
          </Button>
        </div>
        <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
          {rows.map((row) => {
            const id = rowKey(row);
            const stage = staged[id];
            return (
              <article
                key={id}
                className="space-y-2 rounded-lg border border-border bg-surface p-3"
              >
                <label className="flex items-center gap-2 text-sm font-semibold">
                  {batch && (
                    <input
                      type="checkbox"
                      checked={stage.checked}
                      disabled={!!busy || stage.saved}
                      onChange={(e) =>
                        setRow(id, { checked: e.currentTarget.checked })
                      }
                    />
                  )}
                  <span className="min-w-0 truncate" title={row.relPath}>
                    {fileNameOf(row.relPath).replace(/\.[^.]+$/, "")}
                  </span>
                </label>
                {stage.saved ? (
                  <p className="text-sm text-primary">{t("film.saved")}</p>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Input
                        aria-label={t("film.titleInput")}
                        placeholder={t("film.titleInput")}
                        value={stage.text}
                        maxLength={300}
                        disabled={!!busy}
                        onChange={(e) =>
                          setRow(id, {
                            text: e.currentTarget.value,
                            results: undefined,
                            choice: undefined,
                          })
                        }
                      />
                      <Input
                        aria-label={t("film.year")}
                        placeholder={t("film.year")}
                        inputMode="numeric"
                        className="w-24"
                        value={stage.year}
                        maxLength={4}
                        disabled={!!busy}
                        onChange={(e) =>
                          setRow(id, {
                            year: e.currentTarget.value,
                            results: undefined,
                            choice: undefined,
                          })
                        }
                      />
                    </div>
                    {stage.results &&
                      (stage.results.length ? (
                        <label className="block space-y-1 text-sm">
                          <span>{t("film.match")}</span>
                          <select
                            className="block w-full rounded border border-border bg-bg px-2 py-1.5 text-fg"
                            value={stage.choice ?? ""}
                            disabled={!!busy}
                            onChange={(e) =>
                              setRow(id, {
                                choice: e.currentTarget.value || undefined,
                              })
                            }
                          >
                            <option value="">{t("film.choose")}</option>
                            {stage.results.map((match) => (
                              <option
                                key={matchKey(match)}
                                value={matchKey(match)}
                              >
                                {match.title} ({match.year}) · {matchKey(match)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p className="text-sm text-muted">
                          {t("film.noMatch")}
                        </p>
                      ))}
                  </>
                )}
              </article>
            );
          })}
        </div>
        {pageNotice && <p className="text-xs text-muted">{pageNotice}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className="text-sm text-muted">
            {t("film.progress", progress)}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={
              busy
                ? () => {
                    cancelled.current = true;
                  }
                : onClose
            }
          >
            {t(busy ? "film.stop" : "common.close")}
          </Button>
          {onNext && (
            <Button variant="outline" disabled={!!busy} onClick={onNext}>
              {t("film.nextBatch")}
            </Button>
          )}
          <Button
            disabled={!canLookup || !!busy || !confirmed.length}
            onClick={() => void run("save", confirmed)}
          >
            {t("film.saveMatches", { count: confirmed.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
