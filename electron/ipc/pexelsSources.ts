import { MAX_BULK_FILES } from "../../shared/tags.js";
import { handle } from "../core/ipcHandler.js";
import {
  previewPexelsSources,
  writePexelsSources,
} from "../core/queries/pexelsSources.js";
import type { IpcContext } from "./context.js";
import { bulkTargetCores, coreById } from "./helpers.js";

export function registerPexelsSourceHandlers({ ws }: IpcContext): void {
  handle("pexels_sources_preview", (input) => {
    if ("targets" in input) {
      const rows = bulkTargetCores(ws, input.targets).flatMap(
        ({ workspaceId, core, fileIds }) =>
          previewPexelsSources(core.db, workspaceId, { fileIds }),
      );
      return { rows, overLimit: false };
    }
    const { workspaceId, folder } = input;
    const rows = previewPexelsSources(
      coreById(ws, workspaceId).db,
      workspaceId,
      {
        folder,
        limit: MAX_BULK_FILES + 1,
      },
    );
    return rows.length > MAX_BULK_FILES
      ? { rows: [], overLimit: true }
      : { rows, overLimit: false };
  });

  handle(
    "pexels_source_set",
    ({ workspaceId, ...edit }) =>
      writePexelsSources(coreById(ws, workspaceId).db, [edit], true) > 0,
  );
  handle("pexels_sources_save", ({ edits }) => {
    const grouped = new Map<string, typeof edits>();
    for (const edit of edits) {
      const group = grouped.get(edit.workspaceId);
      if (group) group.push(edit);
      else grouped.set(edit.workspaceId, [edit]);
    }
    // Resolve every workspace before writing to any of them.
    const targets = [...grouped].map(([workspaceId, group]) => ({
      core: coreById(ws, workspaceId),
      group,
    }));
    let saved = 0;
    for (const { core, group } of targets) {
      saved += writePexelsSources(core.db, group, false);
    }
    return { saved, skipped: edits.length - saved };
  });
}
