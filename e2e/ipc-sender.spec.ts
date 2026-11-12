import path from "node:path";
import { expect, test } from "./fixtures/app";

test("rejects native requests from a different document with the app preload", async ({
  app,
  ready,
}) => {
  await expect(ready.getByTestId("media-card").first()).toBeVisible();
  const result = await app.evaluate(async ({ BrowserWindow }, preload) => {
    const untrusted = new BrowserWindow({
      show: false,
      webPreferences: { preload, sandbox: true, contextIsolation: true },
    });
    try {
      await untrusted.loadURL(
        "data:text/html,<title>Untrusted test page</title>",
      );
      return (await untrusted.webContents.executeJavaScript(
        "window.api.invoke('app_status').then(() => 'allowed', error => error.message)",
      )) as string;
    } finally {
      untrusted.destroy();
    }
  }, path.resolve("out/preload/preload.js"));
  expect(result).toContain("IPC requests must come from the Meguri app.");
});
