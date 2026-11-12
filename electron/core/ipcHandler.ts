// Typed wrapper around ipcMain.handle that validates the renderer payload
// against the channel's Zod schema before invoking the handler.
//
// Defends against malformed payloads from a compromised renderer / preload
// bypass, and removes the need for ad-hoc destructuring type annotations at
// each handler site (the input type is inferred from the schema registry).
import { app, ipcMain, type IpcMainInvokeEvent } from "electron";
import { isAppRendererUrl } from "./rendererUrl.js";
import {
  ChannelInputs,
  type ChannelInput,
  type ChannelName,
  type ChannelOutput,
} from "../../shared/ipc/channels.js";

export function handle<C extends ChannelName>(
  channel: C,
  fn: (
    input: ChannelInput<C>,
    event: IpcMainInvokeEvent,
  ) => ChannelOutput<C> | Promise<ChannelOutput<C>>,
): void {
  const schema = ChannelInputs[channel];
  ipcMain.handle(channel, async (event, raw: unknown) => {
    const frame = event.senderFrame;
    const devUrl = app.isPackaged
      ? undefined
      : process.env.ELECTRON_RENDERER_URL;
    if (
      !frame ||
      frame !== event.sender.mainFrame ||
      !isAppRendererUrl(frame.url, devUrl)
    )
      throw new Error("IPC requests must come from the Meguri app.");
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid IPC payload for "${channel}": ${issues}`);
    }
    return await fn(parsed.data as ChannelInput<C>, event);
  });
}
