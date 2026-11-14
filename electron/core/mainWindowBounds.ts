import type { Rectangle } from "electron";

export function mainWindowBounds(workArea: Rectangle): Rectangle {
  const width = Math.min(1780, workArea.width - 32);
  const height = Math.min(1400, workArea.height - 24);
  return {
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
  };
}
