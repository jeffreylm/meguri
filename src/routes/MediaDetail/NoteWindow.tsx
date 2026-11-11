import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router";
import { api } from "@/ipc/client";
import { useI18n } from "@/i18n/I18nProvider";
import { fileNameOf } from "@/lib/relPath";
import NoteCard from "./NoteCard";

const closeWindow = () => window.close();

export default function NoteWindow() {
  const { t } = useI18n();
  const { id } = useParams();
  const [params] = useSearchParams();
  const fileId = Number(id);
  const wsId = params.get("ws") ?? "";
  const detail = useQuery({
    queryKey: ["file_get", wsId, fileId],
    queryFn: () => api.fileGet(fileId, wsId),
    enabled: Number.isSafeInteger(fileId) && fileId > 0 && wsId !== "",
  });
  const fileName = detail.data ? fileNameOf(detail.data.relPath) : null;
  useEffect(() => {
    document.title = fileName
      ? `${t("media.note")} — ${fileName}`
      : t("media.note");
  }, [fileName, t]);

  if (detail.isPending && detail.fetchStatus !== "idle") return null;
  if (!detail.data)
    return <div className="p-5 text-fg">{t("media.notFound")}</div>;
  return (
    <main className="h-full min-h-0 bg-bg p-3">
      <NoteCard
        fileId={fileId}
        wsId={wsId}
        note={detail.data.note}
        onClose={closeWindow}
      />
    </main>
  );
}
