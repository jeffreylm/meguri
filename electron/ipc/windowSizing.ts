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

    if (input.mode !== "corner") {
      if (win !== mainWindow()) return;
      const zoom = event.sender.getZoomFactor();
      const [contentWidth, contentHeight] = win.getContentSize();
      // The header expands to the normal desktop size. A dragged player edge
      // asks for just the content area it needs, in renderer CSS pixels.
      const target =
        input.mode === "player"
          ? { width: 1280, height: 800 }
          : {
              width:
                current.width - contentWidth + Math.ceil(input.width * zoom),
              height:
                current.height - contentHeight + Math.ceil(input.height * zoom),
            };
      const width = Math.max(
        current.width,
        Math.min(target.width, workArea.width),
      );
      const height = Math.max(
        current.height,
        Math.min(target.height, workArea.height),
      );
      if (width !== current.width || height !== current.height) {
        win.setBounds({
          x: clamp(current.x, workArea.x, workArea.x + workArea.width - width),
          y: clamp(
            current.y,
            workArea.y,
            workArea.y + workArea.height - height,
          ),
          width,
          height,
        });
      }
      const [actualWidth, actualHeight] = win.getContentSize();
      return {
        width: Math.floor(actualWidth / zoom),
        height: Math.floor(actualHeight / zoom),
      };
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
