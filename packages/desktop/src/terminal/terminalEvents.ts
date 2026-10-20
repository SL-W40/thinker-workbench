/**
 * 终端事件广播（所有窗口）。
 */
import { IpcChannels, type TerminalEvent } from "@thinker-workbench/shared";
import { BrowserWindow } from "electron";

export function broadcast(event: TerminalEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.terminalEvent, event);
    }
  }
}
