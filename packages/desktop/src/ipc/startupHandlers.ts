/**
 * 启动失败记录：渲染进程只读。
 */
import { IpcChannels } from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import { listStartupIssues } from "../startup/issues";

export function registerStartupHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.startupListIssues, () => listStartupIssues());
}
