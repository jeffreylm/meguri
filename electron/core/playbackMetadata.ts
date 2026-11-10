import { Semaphore } from "./concurrency.js";
import { extractMeta } from "./media.js";

const slots = new Semaphore(2);
const pending = new Map<string, Promise<unknown>>();

/** For a just-indexed clip whose stored stream list has not arrived yet. */
export function probePlaybackMetadata(file: string): Promise<unknown> {
  const existing = pending.get(file);
  if (existing) return existing;
  const task = (async () => {
    const signal = AbortSignal.timeout(5_000);
    try {
      const release = await slots.acquire({ signal, maxWaiting: 4 });
      try {
        return (await extractMeta(file, "video", signal)).raw;
      } finally {
        release();
      }
    } catch {
      return null;
    } finally {
      pending.delete(file);
    }
  })();
  pending.set(file, task);
  return task;
}
