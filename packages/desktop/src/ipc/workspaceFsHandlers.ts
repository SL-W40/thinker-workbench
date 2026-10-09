/**
 * 工作空间 FS / Git IPC：供右侧栏 Files / Changes 使用。
 */
import { IpcChannels } from "@thinker-workbench/shared";
import type { IpcMain } from "electron";
import { getWorkspace } from "../db/workspacesStore";
import { listTree, readWorkspaceFile, writeWorkspaceFile } from "../workspace/fs";
import { getGitFileDiff, getGitStatus, gitInit } from "../workspace/git";

/** 解析工作空间根路径。 */
function requireRoot(workspaceId: unknown): string {
  if (typeof workspaceId !== "string" || !workspaceId.trim()) {
    throw new Error("workspaceId required.");
  }
  const ws = getWorkspace(workspaceId.trim());
  if (!ws) throw new Error("Workspace not found.");
  return ws.rootPath;
}

/** 注册 workspaceFs / workspaceGit 通道。 */
export function registerWorkspaceFsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.workspaceFsTree, (_evt, workspaceId: string) => {
    return listTree(requireRoot(workspaceId));
  });

  ipcMain.handle(
    IpcChannels.workspaceFsRead,
    (_evt, payload: { workspaceId: string; path: string }) => {
      return readWorkspaceFile(requireRoot(payload?.workspaceId), payload?.path ?? "");
    },
  );

  ipcMain.handle(
    IpcChannels.workspaceFsWrite,
    (_evt, payload: { workspaceId: string; path: string; content: string }) => {
      writeWorkspaceFile(
        requireRoot(payload?.workspaceId),
        payload?.path ?? "",
        typeof payload?.content === "string" ? payload.content : "",
      );
    },
  );

  ipcMain.handle(IpcChannels.workspaceGitStatus, (_evt, workspaceId: string) => {
    return getGitStatus(requireRoot(workspaceId));
  });

  ipcMain.handle(
    IpcChannels.workspaceGitDiff,
    (_evt, payload: { workspaceId: string; path: string; full?: boolean }) => {
      const ctx = payload?.full ? 100_000 : 3;
      return getGitFileDiff(requireRoot(payload?.workspaceId), payload?.path ?? "", ctx);
    },
  );

  ipcMain.handle(IpcChannels.workspaceGitInit, (_evt, workspaceId: string) => {
    return gitInit(requireRoot(workspaceId));
  });
}
