/**
 * 工作空间 / 聊天会话 IPC：CRUD、折叠态、变更广播。
 */
import {
  type ChatMessage,
  IpcChannels,
  type MoveSessionInput,
  type ReorderInput,
  type WorkspaceCreateInput,
} from "@thinker-workbench/shared";
import { BrowserWindow, type IpcMain, shell } from "electron";
import { openCatalogDb } from "../db/thinkerDb";
import {
  clearWorkspace,
  createSession,
  createWorkspace,
  getActiveSessionId,
  getCollapsedWorkspaceIds,
  getLastWorkspaceId,
  getSession,
  getSessionWithMessages,
  getWorkspace,
  listSessions,
  listWorkspaces,
  moveSession,
  removeSession,
  removeWorkspace,
  renameSession,
  renameWorkspace,
  reorderSessions,
  reorderWorkspaces,
  saveMessages,
  setActiveSessionId,
  setCollapsedWorkspaceIds,
  setLastWorkspaceId,
  setSessionPinned,
  setWorkspacePinned,
} from "../db/workspacesStore";
import type { AgentBridge } from "../utility/AgentBridge";

/** 删会话前先停掉该会话 in-flight run，降低 Trace 迟到写回概率。 */
function cancelSessionRuns(bridge: AgentBridge | undefined, sessionId: string): void {
  const id = sessionId.trim();
  if (!id || !bridge) return;
  const session = getSession(id);
  if (session?.activeRunId?.trim()) {
    bridge.cancel(session.activeRunId.trim());
  }
  bridge.cancelRunsForSession(id);
}

/** 向所有窗口广播工作空间变更。 */
export function broadcastWorkspacesChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.workspacesChanged);
  }
}

/** 向所有窗口广播会话 / 线程列表变更。 */
export function broadcastThreadsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.threadsChanged);
  }
}

/** 注册 workspaces:* / chatSessions:* 通道。 */
export function registerWorkspacesHandlers(ipcMain: IpcMain, bridge?: AgentBridge): void {
  openCatalogDb();

  ipcMain.handle(IpcChannels.workspacesList, async () => listWorkspaces());

  ipcMain.handle(IpcChannels.workspacesCreate, async (_e, input: WorkspaceCreateInput) => {
    const row = createWorkspace(input);
    broadcastWorkspacesChanged();
    return row;
  });

  ipcMain.handle(
    IpcChannels.workspacesRename,
    async (_e, payload: { id: string; name: string }) => {
      const row = renameWorkspace(payload.id, payload.name);
      broadcastWorkspacesChanged();
      return row;
    },
  );

  ipcMain.handle(
    IpcChannels.workspacesSetPinned,
    async (_e, payload: { id: string; pinned: boolean }) => {
      const row = setWorkspacePinned(payload.id, payload.pinned);
      broadcastWorkspacesChanged();
      return row;
    },
  );

  ipcMain.handle(IpcChannels.workspacesReorder, async (_e, input: ReorderInput) => {
    reorderWorkspaces(input);
    broadcastWorkspacesChanged();
  });

  ipcMain.handle(IpcChannels.workspacesRemove, async (_e, id: string) => {
    removeWorkspace(id);
    broadcastWorkspacesChanged();
    broadcastThreadsChanged();
  });

  ipcMain.handle(IpcChannels.workspacesClear, async (_e, id: string) => {
    // 先停跑再清；removeSession 内 purgeSessionArtifacts（checkpoint + Trace）
    for (const s of listSessions(id)) {
      cancelSessionRuns(bridge, s.id);
    }
    clearWorkspace(id);
    broadcastWorkspacesChanged();
    broadcastThreadsChanged();
  });

  ipcMain.handle(IpcChannels.workspacesShowInFolder, async (_e, id: string) => {
    const ws = getWorkspace(id);
    if (!ws) throw new Error("Workspace not found.");
    shell.showItemInFolder(ws.rootPath);
  });

  ipcMain.handle(IpcChannels.chatSessionsList, async (_e, workspaceId?: string) =>
    listSessions(workspaceId),
  );

  ipcMain.handle(
    IpcChannels.chatSessionsCreate,
    async (_e, payload: { workspaceId: string; title?: string }) => {
      const row = createSession(payload.workspaceId, payload.title);
      broadcastThreadsChanged();
      return row;
    },
  );

  ipcMain.handle(IpcChannels.chatSessionsGet, async (_e, sessionId: string) =>
    getSessionWithMessages(sessionId),
  );

  ipcMain.handle(
    IpcChannels.chatSessionsRename,
    async (_e, payload: { sessionId: string; title: string }) => {
      const row = renameSession(payload.sessionId, payload.title);
      broadcastThreadsChanged();
      return row;
    },
  );

  ipcMain.handle(
    IpcChannels.chatSessionsSetPinned,
    async (_e, payload: { sessionId: string; pinned: boolean }) => {
      const row = setSessionPinned(payload.sessionId, payload.pinned);
      broadcastThreadsChanged();
      return row;
    },
  );

  ipcMain.handle(
    IpcChannels.chatSessionsReorder,
    async (_e, payload: { workspaceId: string; input: ReorderInput }) => {
      reorderSessions(payload.workspaceId, payload.input);
      broadcastThreadsChanged();
    },
  );

  ipcMain.handle(IpcChannels.chatSessionsMove, async (_e, input: MoveSessionInput) => {
    const row = moveSession(input);
    broadcastThreadsChanged();
    return row;
  });

  ipcMain.handle(IpcChannels.chatSessionsRemove, async (_e, sessionId: string) => {
    cancelSessionRuns(bridge, sessionId);
    removeSession(sessionId);
    broadcastThreadsChanged();
  });

  ipcMain.handle(
    IpcChannels.chatSessionsSaveMessages,
    async (_e, payload: { sessionId: string; messages: ChatMessage[] }) => {
      saveMessages(payload.sessionId, payload.messages);
      broadcastThreadsChanged();
    },
  );

  ipcMain.handle(IpcChannels.chatSessionsSetActive, async (_e, sessionId: string | null) => {
    setActiveSessionId(sessionId);
  });

  ipcMain.handle(IpcChannels.chatSessionsGetActive, async () => getActiveSessionId());

  ipcMain.handle(IpcChannels.chatSessionsGetLastWorkspace, async () => getLastWorkspaceId());

  ipcMain.handle(IpcChannels.chatSessionsSetLastWorkspace, async (_e, workspaceId: string | null) => {
    setLastWorkspaceId(workspaceId);
  });

  ipcMain.handle(IpcChannels.chatSessionsGetCollapsed, async () => getCollapsedWorkspaceIds());

  ipcMain.handle(IpcChannels.chatSessionsSetCollapsed, async (_e, ids: string[]) => {
    setCollapsedWorkspaceIds(ids);
  });
}
