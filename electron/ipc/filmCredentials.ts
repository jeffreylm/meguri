import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";
import { OmdbKey } from "../../shared/filmMetadata.js";

const keyFile = () => path.join(app.getPath("userData"), "omdb-key.bin");
// The personal build uses the macOS Keychain or Windows DPAPI. A Linux
// session can still look up films without falling back to weak disk storage.
const canPersist =
  process.platform === "darwin" || process.platform === "win32";
let sessionKey: string | undefined;
let savedKey: string | undefined;

export async function currentFilmKey(): Promise<string | undefined> {
  if (sessionKey || !canPersist) return sessionKey;
  try {
    const encrypted = await fs.readFile(keyFile());
    const { result } = await safeStorage.decryptStringAsync(encrypted);
    const key = OmdbKey.safeParse(result);
    if (!sessionKey && key.success) sessionKey = savedKey = key.data;
  } catch {
    // First use, unavailable credentials, or a locked Keychain.
  }
  return sessionKey;
}

export async function rememberValidatedFilmKey(key: string): Promise<void> {
  sessionKey = key;
  if (!canPersist || savedKey === key) return;
  const file = keyFile();
  const staging = `${file}.${randomUUID()}.tmp`;
  try {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return;
    const encrypted = await safeStorage.encryptStringAsync(key);
    await fs.writeFile(staging, encrypted, { mode: 0o600, flag: "wx" });
    await fs.rename(staging, file);
    savedKey = key;
  } catch {
    // Keep the working key in memory when protected storage is unavailable.
  } finally {
    await fs.rm(staging, { force: true }).catch(() => {});
  }
}

export async function filmKeyStatus(): Promise<
  "missing" | "session" | "saved"
> {
  const key = await currentFilmKey();
  return key ? (key === savedKey ? "saved" : "session") : "missing";
}
