import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { sourceWebUrl } from "../../shared/downloadOrigin.js";
import { Semaphore } from "./concurrency.js";

const run = promisify(execFile);
const slots = new Semaphore(2);
const options = { timeout: 2000, maxBuffer: 128 * 1024 };
const attr = "com.apple.metadata:kMDItemWhereFroms";

/** Read only the browser's recorded URLs. They never become catalogue data. */
export async function readDownloadOrigin(abs: string): Promise<string[]> {
  if (process.platform !== "darwin") return [];
  const release = await slots.acquire({ maxWaiting: 8 });
  try {
    if (!(await stat(abs)).isFile()) return [];
    const { stdout } = await run("/usr/bin/xattr", ["-px", attr, abs], options);
    const hex = stdout.replace(/\s+/g, "");
    if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return [];
    const convert = run(
      "/usr/bin/plutil",
      ["-convert", "json", "-o", "-", "-"],
      options,
    );
    convert.child.stdin?.on("error", () => {});
    convert.child.stdin?.end(Buffer.from(hex, "hex"));
    const value: unknown = JSON.parse((await convert).stdout);
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value.filter(
          (item): item is string =>
            typeof item === "string" && sourceWebUrl(item) !== null,
        ),
      ),
    ].slice(0, 8);
  } catch {
    // No attribute is normal. Metadata from moved or unreadable files can be absent.
    return [];
  } finally {
    release();
  }
}
