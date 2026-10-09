/**
 * Preload 脚本：通过 contextBridge 向渲染进程暴露受限的 `window.thinker` API。
 *
 * 仅转发 @thinker-workbench/shared 约定的 IPC 通道；不直接访问 Node/fs。
 */
import { contextBridge, ipcRenderer } from "electron";
import {
  IpcChannels,
  type AgentEvent,
  type AgentResumeCommand,
  type AgentRunCommand,
  type AttentionPreviewKind,
  type ChatMessage,
  type ContextUsageRequest,
  type DataDirChangeRequest,
  type DataDirMigrateProgress,
  type GeneralSettings,
  type LogRecord,
  type ModelSettingsPatch,
  type MoveSessionInput,
  type ReorderInput,
  type ShortcutsMap,
  type AuxPageId,
  type LogsQuery,
  type ThinkerApi,
  type UiSessionSnapshot,
  type WindowRole,
  type WorkspaceCreateInput,
  type RunResult,
} from "@thinker-workbench/shared";

/** 渲染进程可用的 Thinker 桌面桥接实现。 */
const api: ThinkerApi = {
  run(command: AgentRunCommand | string): Promise<RunResult> {
    return ipcRenderer.invoke(IpcChannels.agentRun, command);
  },
  cancel(runId?: string): Promise<void> {
    return ipcRenderer.invoke(IpcChannels.agentCancel, runId?.trim() ? { runId } : {});
  },
  resume(command: AgentResumeCommand): Promise<RunResult> {
    return ipcRenderer.invoke(IpcChannels.agentResume, command);
  },
  getContextUsage(request?: ContextUsageRequest) {
    return ipcRenderer.invoke(IpcChannels.contextUsage, request ?? {});
  },
  listThreads() {
    return ipcRenderer.invoke(IpcChannels.agentListThreads);
  },
  onEvent(cb: (event: AgentEvent) => void): () => void {
    const handler = (_evt: unknown, event: AgentEvent) => cb(event);
    ipcRenderer.on(IpcChannels.agentEvent, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.agentEvent, handler);
    };
  },
  onLog(cb: (record: LogRecord) => void): () => void {
    const handler = (_evt: unknown, record: LogRecord) => cb(record);
    ipcRenderer.on(IpcChannels.logEvent, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.logEvent, handler);
    };
  },
  reportLog(record: LogRecord): void {
    ipcRenderer.send(IpcChannels.logRecord, record);
  },
  settings: {
    getModel: () => ipcRenderer.invoke(IpcChannels.settingsGetModel),
    setModel: (patch: ModelSettingsPatch) =>
      ipcRenderer.invoke(IpcChannels.settingsSetModel, patch),
    getShortcuts: () => ipcRenderer.invoke(IpcChannels.settingsGetShortcuts),
    setShortcuts: (patch: Partial<ShortcutsMap>) =>
      ipcRenderer.invoke(IpcChannels.settingsSetShortcuts, patch),
    setShortcutRecording: (active: boolean) => {
      ipcRenderer.send(IpcChannels.settingsShortcutRecording, active);
    },
    getGeneral: () => ipcRenderer.invoke(IpcChannels.settingsGetGeneral),
    getGeneralSync: () =>
      ipcRenderer.sendSync(IpcChannels.settingsGetGeneralSync) as GeneralSettings,
    setGeneral: (patch: Partial<GeneralSettings>) =>
      ipcRenderer.invoke(IpcChannels.settingsSetGeneral, patch),
    onGeneralChanged(cb) {
      const handler = (_evt: unknown, general: GeneralSettings) => cb(general);
      ipcRenderer.on(IpcChannels.settingsGeneralChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannels.settingsGeneralChanged, handler);
    },
    previewAttention: (kind: AttentionPreviewKind) =>
      ipcRenderer.invoke(IpcChannels.settingsPreviewAttention, kind),
    pickDirectory: (options?: { title?: string; defaultPath?: string }) =>
      ipcRenderer.invoke(IpcChannels.settingsPickDirectory, options) as Promise<string | null>,
    saveTextFile: (options: {
      content: string;
      defaultPath?: string;
      title?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }) =>
      ipcRenderer.invoke(IpcChannels.settingsSaveTextFile, options) as Promise<string | null>,
    previewDataDirChange: (dataDir: string) =>
      ipcRenderer.invoke(IpcChannels.settingsPreviewDataDirChange, dataDir),
    applyDataDirChange: (request: DataDirChangeRequest) =>
      ipcRenderer.invoke(IpcChannels.settingsApplyDataDirChange, request),
    onDataDirMigrateProgress(cb: (progress: DataDirMigrateProgress) => void) {
      const handler = (_evt: unknown, progress: DataDirMigrateProgress) => cb(progress);
      ipcRenderer.on(IpcChannels.settingsDataDirMigrateProgress, handler);
      return () =>
        ipcRenderer.removeListener(IpcChannels.settingsDataDirMigrateProgress, handler);
    },
  },
  session: {
    getSnapshot: () => ipcRenderer.sendSync(IpcChannels.sessionGet) as UiSessionSnapshot | null,
    setSnapshot: (snapshot: UiSessionSnapshot) => {
      ipcRenderer.send(IpcChannels.sessionSet, snapshot);
    },
  },
  window: {
    minimize: () => ipcRenderer.invoke(IpcChannels.windowMinimize),
    maximize: () => ipcRenderer.invoke(IpcChannels.windowMaximize),
    close: () => ipcRenderer.invoke(IpcChannels.windowClose),
    isMaximized: () => ipcRenderer.invoke(IpcChannels.windowIsMaximized),
    onMaximized(cb) {
      const handler = (_evt: unknown, maximized: boolean) => cb(Boolean(maximized));
      ipcRenderer.on(IpcChannels.windowMaximized, handler);
      return () => ipcRenderer.removeListener(IpcChannels.windowMaximized, handler);
    },
    toggleDevTools: () => ipcRenderer.invoke(IpcChannels.windowToggleDevTools),
    openOrFocusPage: (page: AuxPageId) =>
      ipcRenderer.invoke(IpcChannels.windowOpenOrFocusPage, page),
    focusPageIfOpen: (page: AuxPageId) =>
      ipcRenderer.invoke(IpcChannels.windowFocusPageIfOpen, page) as Promise<boolean>,
    focusMain: () => ipcRenderer.invoke(IpcChannels.windowFocusMain),
    getRoleSync: () => ipcRenderer.sendSync(IpcChannels.windowGetRoleSync) as WindowRole,
  },
  tools: {
    logsMeta: () => ipcRenderer.invoke(IpcChannels.toolsLogsMeta),
    logsTraces: (limit?: number) => ipcRenderer.invoke(IpcChannels.toolsLogsTraces, limit),
    logsQuery: (query: LogsQuery) => ipcRenderer.invoke(IpcChannels.toolsLogsQuery, query),
  },
  workspaces: {
    list: () => ipcRenderer.invoke(IpcChannels.workspacesList),
    create: (input: WorkspaceCreateInput) => ipcRenderer.invoke(IpcChannels.workspacesCreate, input),
    rename: (id, name) => ipcRenderer.invoke(IpcChannels.workspacesRename, { id, name }),
    setPinned: (id, pinned) =>
      ipcRenderer.invoke(IpcChannels.workspacesSetPinned, { id, pinned }),
    reorder: (input: ReorderInput) => ipcRenderer.invoke(IpcChannels.workspacesReorder, input),
    remove: (id) => ipcRenderer.invoke(IpcChannels.workspacesRemove, id),
    clear: (id) => ipcRenderer.invoke(IpcChannels.workspacesClear, id),
    showInFolder: (id) => ipcRenderer.invoke(IpcChannels.workspacesShowInFolder, id),
    onChanged(cb) {
      const handler = () => cb();
      ipcRenderer.on(IpcChannels.workspacesChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannels.workspacesChanged, handler);
    },
    listSessions: (workspaceId?) =>
      ipcRenderer.invoke(IpcChannels.chatSessionsList, workspaceId),
    createSession: (workspaceId, title?) =>
      ipcRenderer.invoke(IpcChannels.chatSessionsCreate, { workspaceId, title }),
    getSession: (sessionId) => ipcRenderer.invoke(IpcChannels.chatSessionsGet, sessionId),
    renameSession: (sessionId, title) =>
      ipcRenderer.invoke(IpcChannels.chatSessionsRename, { sessionId, title }),
    setSessionPinned: (sessionId, pinned) =>
      ipcRenderer.invoke(IpcChannels.chatSessionsSetPinned, { sessionId, pinned }),
    reorderSessions: (workspaceId, input) =>
      ipcRenderer.invoke(IpcChannels.chatSessionsReorder, { workspaceId, input }),
    moveSession: (input: MoveSessionInput) =>
      ipcRenderer.invoke(IpcChannels.chatSessionsMove, input),
    removeSession: (sessionId) => ipcRenderer.invoke(IpcChannels.chatSessionsRemove, sessionId),
    saveMessages: (sessionId, messages: ChatMessage[]) =>
      ipcRenderer.invoke(IpcChannels.chatSessionsSaveMessages, { sessionId, messages }),
    setActiveSession: (sessionId) =>
      ipcRenderer.invoke(IpcChannels.chatSessionsSetActive, sessionId),
    getActiveSessionId: () => ipcRenderer.invoke(IpcChannels.chatSessionsGetActive),
    getLastWorkspaceId: () => ipcRenderer.invoke(IpcChannels.chatSessionsGetLastWorkspace),
    setLastWorkspaceId: (workspaceId) =>
      ipcRenderer.invoke(IpcChannels.chatSessionsSetLastWorkspace, workspaceId),
    getCollapsedWorkspaceIds: () => ipcRenderer.invoke(IpcChannels.chatSessionsGetCollapsed),
    setCollapsedWorkspaceIds: (ids) =>
      ipcRenderer.invoke(IpcChannels.chatSessionsSetCollapsed, ids),
    onThreadsChanged(cb) {
      const handler = () => cb();
      ipcRenderer.on(IpcChannels.threadsChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannels.threadsChanged, handler);
    },
  },
  workspaceFs: {
    tree: (workspaceId: string) => ipcRenderer.invoke(IpcChannels.workspaceFsTree, workspaceId),
    readFile: (workspaceId: string, path: string) =>
      ipcRenderer.invoke(IpcChannels.workspaceFsRead, { workspaceId, path }),
    writeFile: (workspaceId: string, path: string, content: string) =>
      ipcRenderer.invoke(IpcChannels.workspaceFsWrite, { workspaceId, path, content }),
    gitStatus: (workspaceId: string) =>
      ipcRenderer.invoke(IpcChannels.workspaceGitStatus, workspaceId),
    gitFileDiff: (workspaceId: string, path: string, full?: boolean) =>
      ipcRenderer.invoke(IpcChannels.workspaceGitDiff, { workspaceId, path, full }),
    gitInit: (workspaceId: string) =>
      ipcRenderer.invoke(IpcChannels.workspaceGitInit, workspaceId),
  },
};

contextBridge.exposeInMainWorld("thinker", api);
