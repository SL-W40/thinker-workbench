/**
 * 浏览器事件广播（所有窗口）。
 */
import { type BrowserEvent, IpcChannels } from "@thinker-workbench/shared";
import { BrowserWindow } from "electron";

export function broadcast(event: BrowserEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.browserEvent, event);
    }
  }
}
