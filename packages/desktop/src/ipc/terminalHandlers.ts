/**
 * 终端 IPC：列表 / 创建 / 写 / resize / kill / shell profiles。
 */
import { IpcChannels } from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import { getActiveWorkspaceRoot } from "../db/workspacesStore";
import { listAvailableShellProfiles } from "../terminal/detectShellProfiles";
import { terminalSessionManager } from "../terminal/TerminalSessionManager";

/** 注册 terminal:* 通道。 */
export function registerTerminalHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.terminalList, async () => {
    return terminalSessionManager.list();
  });

  ipcMain.handle(IpcChannels.terminalListShellProfiles, async () => {
    return listAvailableShellProfiles();
  });

  ipcMain.handle(
    IpcChannels.terminalCreate,
    async (
      _evt,
      options?: { cwd?: string; cols?: number; rows?: number; profileId?: string },
    ) => {
      const cwd = options?.cwd?.trim() || getActiveWorkspaceRoot() || undefined;
      return terminalSessionManager.createInteractive({
        cwd,
        cols: options?.cols,
        rows: options?.rows,
        profileId: options?.profileId,
      });
    },
  );

  ipcMain.handle(
    IpcChannels.terminalWrite,
    async (_evt, payload: { sessionId: string; data: string }) => {
      if (!payload?.sessionId || typeof payload.data !== "string") return;
      terminalSessionManager.write(payload.sessionId, payload.data);
    },
  );

  ipcMain.handle(
    IpcChannels.terminalResize,
    async (_evt, payload: { sessionId: string; cols: number; rows: number }) => {
      if (!payload?.sessionId) return;
      terminalSessionManager.resize(payload.sessionId, payload.cols, payload.rows);
    },
  );

  ipcMain.handle(IpcChannels.terminalKill, async (_evt, sessionId: string) => {
    if (typeof sessionId !== "string" || !sessionId.trim()) return;
    terminalSessionManager.kill(sessionId.trim());
  });

  ipcMain.handle(IpcChannels.terminalGetOutput, async (_evt, sessionId: string) => {
    if (typeof sessionId !== "string" || !sessionId.trim()) return "";
    return terminalSessionManager.getOutput(sessionId.trim());
  });
}
