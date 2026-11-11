import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb, openDbReadonly, type DB } from "../db.js";
import {
  fileDetail,
  migrateMetaKey,
  searchFiles,
  setNote,
  setRating,
  upsertScanRoot,
} from "../queries.js";
import { insertFile, newDb } from "./helpers.js";

function noteRow(db: DB, metaKey: string): { note: string | null } | undefined {
  return db
    .prepare("SELECT note FROM catalogue_notes WHERE meta_key = ?")
    .get(metaKey) as { note: string | null } | undefined;
}

describe("setNote", () => {
  it("stores the Markdown as given and reads it back through fileDetail", () => {
    const { db, rootId } = newDb();
    const id = insertFile(db, rootId, { relPath: "a.mp4", contentHash: "h" });
    const md = "### Source\n\n- https://example.com/clip\n\n  trailing  ";
    setNote(db, id, md);
    expect(fileDetail(db, id)?.note).toBe(md);
  });

  it("stores whitespace-only text as no note", () => {
    const { db, rootId } = newDb();
    const id = insertFile(db, rootId, { relPath: "a.mp4", contentHash: "h" });
    setNote(db, id, "something");
    setNote(db, id, "  \n\t ");
    expect(noteRow(db, "h")).toBeUndefined();
    expect(fileDetail(db, id)?.note).toBeNull();
  });

  it("creates no row just to remove a note", () => {
    const { db, rootId } = newDb();
    const id = insertFile(db, rootId, { relPath: "a.mp4", contentHash: "h" });
    setNote(db, id, null);
    expect(noteRow(db, "h")).toBeUndefined();
  });

  it("leaves the other metadata alone", () => {
    const { db, rootId } = newDb();
    const id = insertFile(db, rootId, { relPath: "a.mp4", contentHash: "h" });
    setRating(db, id, 4);
    setNote(db, id, "note");
    setNote(db, id, null);
    expect(fileDetail(db, id)?.rating).toBe(4);
  });

  it("reports that a file was removed instead of reporting a save", () => {
    const { db } = newDb();
    expect(() => setNote(db, 999, "note")).toThrow(
      "no longer in the catalogue",
    );
  });
});

describe("merging notes", () => {
  function seedNotes(db: DB, rows: [string, string | null][]): void {
    const ins = db.prepare(
      "INSERT INTO file_notes (meta_key, note) VALUES (?, ?)",
    );
    for (const [key, note] of rows) if (note !== null) ins.run(key, note);
  }

  it("carries a note to a key that has none", () => {
    const { db } = newDb();
    seedNotes(db, [["path:a", "from path"]]);
    migrateMetaKey(db, "path:a", "h");
    expect(noteRow(db, "h")?.note).toBe("from path");
    expect(noteRow(db, "path:a")).toBeUndefined();
  });

  it("keeps the target's note when the source has none", () => {
    const { db } = newDb();
    seedNotes(db, [
      ["path:a", null],
      ["h", "held"],
    ]);
    migrateMetaKey(db, "path:a", "h");
    expect(noteRow(db, "h")?.note).toBe("held");
  });

  it("joins two different notes, the held one first", () => {
    const { db } = newDb();
    seedNotes(db, [
      ["path:a", "incoming"],
      ["h", "held"],
    ]);
    migrateMetaKey(db, "path:a", "h");
    expect(noteRow(db, "h")?.note).toBe("held\n\n---\n\nincoming");
  });

  it("does not repeat a note that is already one whole part of the other", () => {
    const { db } = newDb();
    seedNotes(db, [
      // The incoming note is one part of a note joined before.
      ["path:a", "b"],
      ["h", "a\n\n---\n\nb"],
      // The held note is one part of the incoming one.
      ["path:b", "a\n\n---\n\nb"],
      ["h2", "a"],
      // The same note on both sides.
      ["path:c", "same"],
      ["h3", "same"],
    ]);
    migrateMetaKey(db, "path:a", "h");
    migrateMetaKey(db, "path:b", "h2");
    migrateMetaKey(db, "path:c", "h3");
    expect(noteRow(db, "h")?.note).toBe("a\n\n---\n\nb");
    expect(noteRow(db, "h2")?.note).toBe("a\n\n---\n\nb");
    expect(noteRow(db, "h3")?.note).toBe("same");
  });

  it("still joins a note that only appears inside the other's text", () => {
    const { db } = newDb();
    seedNotes(db, [
      ["path:a", "OK"],
      ["h", "Not OK, re-encode"],
    ]);
    migrateMetaKey(db, "path:a", "h");
    expect(noteRow(db, "h")?.note).toBe("Not OK, re-encode\n\n---\n\nOK");
  });

  it("changes nothing when the same row is merged again", () => {
    const { db } = newDb();
    seedNotes(db, [
      ["h", "held"],
      ["path:a", "incoming"],
    ]);
    migrateMetaKey(db, "path:a", "h");
    const once = noteRow(db, "h")?.note;
    seedNotes(db, [["path:a", "incoming"]]);
    migrateMetaKey(db, "path:a", "h");
    expect(once).toBe("held\n\n---\n\nincoming");
    expect(noteRow(db, "h")?.note).toBe(once);
  });
});

describe("notes across workspaces", () => {
  it("shares content notes, keeps fallback paths separate, and reads through a worker connection", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meguri-note-"));
    const firstPath = path.join(dir, "first.sqlite");
    const secondPath = path.join(dir, "second.sqlite");
    const notesPath = path.join(dir, "notes.sqlite");
    const first = openDb(firstPath, notesPath);
    const second = openDb(secondPath, notesPath);
    const reader = openDbReadonly(secondPath, notesPath);
    try {
      const rootA = upsertScanRoot(first, "/first", "first");
      const rootB = upsertScanRoot(second, "/second", "second");
      const clipA = insertFile(first, rootA, {
        relPath: "clip.mp4",
        contentHash: "h",
      });
      const clipB = insertFile(second, rootB, {
        relPath: "copy.mp4",
        contentHash: "h",
      });
      const pendingA = insertFile(first, rootA, { relPath: "pending.mp4" });
      const pendingB = insertFile(second, rootB, { relPath: "pending.mp4" });
      setNote(first, clipA, "Shared credit");
      expect(fileDetail(second, clipB)?.note).toBe("Shared credit");
      expect(noteRow(reader, "h")?.note).toBe("Shared credit");
      expect(
        searchFiles(reader, { q: "note:credit" }).items.map((row) => row.id),
      ).toEqual([clipB]);
      setNote(first, pendingA, "From the first folder");
      expect(fileDetail(second, pendingB)?.note).toBeNull();
      migrateMetaKey(first, `p:${rootA}:pending.mp4`, "h");
      expect(fileDetail(second, clipB)?.note).toBe(
        "Shared credit\n\n---\n\nFrom the first folder",
      );
      expect(noteRow(first, `p:${rootA}:pending.mp4`)).toBeUndefined();
      setNote(second, clipB, null);
      expect(fileDetail(first, clipA)?.note).toBeNull();
    } finally {
      reader.close();
      second.close();
      first.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
