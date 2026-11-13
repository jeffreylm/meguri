// Per-file thumbnail status (path on disk + status flag).
import type { DB } from "../db.js";
import { getSetting, setSetting } from "./settings.js";

export const FILE_HAS_THUMB = `(f.thumb_path IS NOT NULL OR
  (f.kind = 'audio' AND EXISTS (
    SELECT 1 FROM audio_artwork WHERE meta_key = f.meta_key
  )))`;

export function setThumb(
  db: DB,
  fileId: number,
  thumbPath: string | null,
  status: string,
): void {
  db.prepare(
    "UPDATE files SET thumb_path = ?, thumb_status = ? WHERE id = ?",
  ).run(thumbPath, status, fileId);
}

export function filesNeedingThumb(
  db: DB,
  rootId: number,
  fileIds?: readonly number[],
): { id: number; abs_path: string; kind: string }[] {
  return db
    .prepare(
      "SELECT id, abs_path, kind FROM files WHERE root_id = ? AND deleted_at IS NULL AND thumb_status = 'pending'" +
        (fileIds ? " AND id IN (SELECT value FROM json_each(?))" : ""),
    )
    .all(...(fileIds ? [rootId, JSON.stringify(fileIds)] : [rootId])) as {
    id: number;
    abs_path: string;
    kind: string;
  }[];
}

/** Retry failed HEIF thumbnails once after the bundled FFmpeg upgrade. */
export function retryLegacyHeifThumbnails(db: DB, rootId: number): void {
  const key = `heif_thumbnail_retry_v2:${rootId}`;
  db.transaction(() => {
    if (getSetting(db, key) !== null) return;
    db.prepare(
      `UPDATE files SET thumb_status = 'pending'
       WHERE root_id = ? AND deleted_at IS NULL AND kind = 'image'
         AND ext IN ('heic', 'heif') AND thumb_status = 'error'`,
    ).run(rootId);
    setSetting(db, key, "1");
  })();
}
