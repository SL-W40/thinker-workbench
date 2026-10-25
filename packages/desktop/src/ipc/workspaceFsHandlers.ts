/**
 * 工作空间 FS / Git IPC：供右侧栏 Files / Changes 使用。
 */
import { IpcChannels } from "@thinker-workbench/shared";
import { type IpcMain, shell } from "electron";
import { parseWorkspaceFileText } from "../chat/attachments";
import { getWorkspace } from "../db/workspacesStore";
import {
  createWorkspaceDir,
  deleteWorkspacePath,
  listTree,
  readWorkspaceFile,
  renameWorkspacePath,
  workspaceAbsPath,
  writeWorkspaceFile,
} from "../workspace/fs";
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

  ipcMain.handle(
    IpcChannels.workspaceFsMkdir,
    (_evt, payload: { workspaceId: string; path: string }) => {
      createWorkspaceDir(requireRoot(payload?.workspaceId), payload?.path ?? "");
    },
  );

  ipcMain.handle(
    IpcChannels.workspaceFsRename,
    (_evt, payload: { workspaceId: string; from: string; to: string }) => {
      renameWorkspacePath(
        requireRoot(payload?.workspaceId),
        payload?.from ?? "",
        payload?.to ?? "",
      );
    },
  );

  ipcMain.handle(
    IpcChannels.workspaceFsRemove,
    async (_evt, payload: { workspaceId: string; path: string }) => {
      const root = requireRoot(payload?.workspaceId);
      const rel = payload?.path ?? "";
      if (!rel || rel === ".") throw new Error("Refusing to remove workspace root.");
      try {
        // 优先系统回收站：用户误删可在文件管理器里还原。
        await shell.trashItem(workspaceAbsPath(root, rel));
      } catch {
        // 回收站不可用（无桌面环境 / 权限不足）时才硬删除。
        deleteWorkspacePath(root, rel);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.workspaceFsReveal,
    (_evt, payload: { workspaceId: string; path: string }) => {
      shell.showItemInFolder(
        workspaceAbsPath(requireRoot(payload?.workspaceId), payload?.path ?? ""),
      );
    },
  );

  // 文本解读（file-parsers 分发）走 chat/attachments 的实现，但目标是 workspaceFs 内容通道，
  // 故登记在本文件而非 workspacesHandlers，保持 workspaceFs* 前缀归属一致。
  ipcMain.handle(
    IpcChannels.workspaceFsParseText,
    (_evt, payload: { workspaceId: string; path: string }) => {
      return parseWorkspaceFileText(payload?.workspaceId ?? "", payload?.path ?? "");
    },
  );
}
