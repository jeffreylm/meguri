import { useState } from "react";
import { toast } from "sonner";
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
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/ipc/client";
import { formatDuration } from "@/lib/format";

export function ReferenceStillDialog({
  id,
  workspaceId,
  sec,
  onClose,
}: {
  id: number;
  workspaceId: string;
  sec: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [project, setProject] = useLocalStorage(
    "meguri.reference.project",
    "",
    (raw) => raw?.slice(0, 200) ?? "",
  );
  const [highPrecision, setHighPrecision] = useLocalStorage(
    "meguri.reference.highPrecision",
    false,
    (raw) => raw === "true",
  );
  const [details, setDetails] = useState({
    note: "",
    keywords: "",
    scene: "",
    shot: "",
    take: "",
    reel: "",
  });
  const [busy, setBusy] = useState(false);
  const productionFields = ["scene", "shot", "take", "reel"] as const;

  async function save() {
    setBusy(true);
    try {
      const result = await api.frameExport(id, workspaceId, sec, {
        ...details,
        project,
        highPrecision,
      });
      if (result.saved) {
        toast.success(t("player.frameExported"));
        onClose();
      }
    } catch {
      toast.error(t("player.frameExportFailed"));
    } finally {
      setBusy(false);
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
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>{t("reference.save")}</DialogTitle>
          <DialogDescription>
            {t("reference.help", {
              time: formatDuration(sec, { hours: true, fallback: "0:00" }),
            })}
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={busy} className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span>{t("reference.project")}</span>
            <Input
              value={project}
              maxLength={200}
              onChange={(event) => setProject(event.currentTarget.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t("reference.note")}</span>
            <textarea
              rows={3}
              maxLength={3000}
              value={details.note}
              onChange={(event) =>
                setDetails({ ...details, note: event.currentTarget.value })
              }
              className="block w-full rounded-md border border-border bg-bg px-3 py-2 text-fg"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t("reference.keywords")}</span>
            <Input
              value={details.keywords}
              maxLength={800}
              onChange={(event) =>
                setDetails({ ...details, keywords: event.currentTarget.value })
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {productionFields.map((field) => (
              <label key={field} className="block space-y-1 text-sm">
                <span>{t(`reference.${field}`)}</span>
                <Input
                  value={details[field]}
                  maxLength={80}
                  onChange={(event) =>
                    setDetails({
                      ...details,
                      [field]: event.currentTarget.value,
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={highPrecision}
              onChange={(event) =>
                setHighPrecision(event.currentTarget.checked)
              }
            />
            {t("reference.highPrecision")}
          </label>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {t("reference.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
