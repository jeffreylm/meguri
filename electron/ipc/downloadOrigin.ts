import type {
  DownloadOrigin,
  SavedDownloadSource,
} from "../../shared/downloadOrigin.js";
import { readDownloadOrigin } from "../core/downloadOrigin.js";
import { handle } from "../core/ipcHandler.js";
import { isInsideRoot } from "../core/paths.js";
import type { IpcContext } from "./context.js";
import { coreById } from "./helpers.js";

export function registerDownloadOriginHandlers({ ws }: IpcContext): void {
  handle(
    "download_origin_get",
    async ({ id, workspaceId }): Promise<DownloadOrigin> => {
      const { db, root } = coreById(ws, workspaceId);
      const file = db
        .prepare(
          "SELECT abs_path AS path, meta_key AS metaKey FROM files WHERE id = ? AND deleted_at IS NULL",
        )
        .get(id) as { path: string; metaKey: string } | undefined;
      if (!file) throw new Error("The file is no longer in the catalogue");
      const saved = db
        .prepare(
          "SELECT website, url, asset_id AS assetId FROM download_sources WHERE meta_key = ?",
        )
        .get(file.metaKey) as SavedDownloadSource | undefined;
      const urls =
        process.platform === "darwin" && isInsideRoot(file.path, root)
          ? await readDownloadOrigin(file.path)
          : [];
      return { metaKey: file.metaKey, urls, saved: saved ?? null };
    },
  );

  handle("download_origin_set", ({ id, workspaceId, metaKey, source }) => {
    const { db } = coreById(ws, workspaceId);
    if (
      !db
        .prepare(
          "SELECT 1 FROM files WHERE id = ? AND meta_key = ? AND deleted_at IS NULL",
        )
        .get(id, metaKey)
    ) {
      throw new Error("The file changed while editing its source");
    }
    if (!source) {
      db.prepare("DELETE FROM download_sources WHERE meta_key = ?").run(
        metaKey,
      );
      return;
    }
    db.prepare(
      `INSERT INTO download_sources (meta_key, website, url, asset_id)
      VALUES (?, ?, ?, ?) ON CONFLICT(meta_key) DO UPDATE SET
      website = excluded.website, url = excluded.url, asset_id = excluded.asset_id`,
    ).run(metaKey, source.website, source.url, source.assetId);
  });
}
