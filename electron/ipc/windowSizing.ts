import { BrowserWindow, screen } from "electron";
import { handle } from "../core/ipcHandler.js";
import type { IpcContext } from "./context.js";

export function registerWindowSizingHandlers({ mainWindow }: IpcContext): void {
  handle("window_resize", (input, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (
      !win ||
      win.isDestroyed() ||
      !win.isResizable() ||
      win.isFullScreen() ||
      win.isMaximized() ||
      win.isMinimized()
    )
      return;
    const current = win.getBounds();
    const { workArea } = screen.getDisplayMatching(current);
    const [minWidth, minHeight] = win.getMinimumSize();
    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(value, max));

    if (input.mode === "player") {
      if (win !== mainWindow()) return;
      // Enlarge from a compact browser window to the normal desktop size.
      // Keep a larger existing window intact, including on a smaller monitor.
      const width = Math.max(current.width, Math.min(1280, workArea.width));
      const height = Math.max(current.height, Math.min(800, workArea.height));
      if (width === current.width && height === current.height) return;
      win.setBounds({
        x: clamp(current.x, workArea.x, workArea.x + workArea.width - width),
        y: clamp(current.y, workArea.y, workArea.y + workArea.height - height),
        width,
        height,
      });
      return;
    }

    win.setBounds({
      ...current,
      width: clamp(
        input.width,
        minWidth,
        workArea.x + workArea.width - current.x,
      ),
      height: clamp(
        input.height,
        minHeight,
        workArea.y + workArea.height - current.y,
      ),
    });
  });
}
