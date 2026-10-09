/**
 * 工作空间 / 聊天会话元数据与桌面 API 面。
 * 侧栏由 SQLite 权威数据驱动；`ThreadMeta` 经 `agent:listThreads` 下发。
 */

/** 会话运行状态（侧栏圆点 / Resume）。 */
export type SessionRunStatus = "idle" | "running" | "interrupted" | "failed";

/** 工作空间行（侧栏文件夹）。 */
export type WorkspaceRecord = {
  id: string;
  name: string;
  rootPath: string;
  pinned: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  /** 内置默认工作空间：不可删除，仅可清空会话。 */
  isDefault: boolean;
};

/** 创建工作空间入参。 */
export type WorkspaceCreateInput = {
  rootPath: string;
  name?: string;
};

/** 侧栏会话列表项（`agent:listThreads` 返回）。 */
export type ThreadMeta = {
  id: string;
  sessionId: string;
  workspaceId: string;
  title: string;
  updatedAt: number;
  pinned: boolean;
  sortOrder: number;
  runStatus: SessionRunStatus;
};

/** 聊天会话完整记录（含消息 hydrate）。 */
export type ChatSessionRecord = {
  id: string;
  threadId: string;
  workspaceId: string;
  title: string;
  pinned: boolean;
  sortOrder: number;
  runStatus: SessionRunStatus;
  activeRunId: string | null;
  interruptReason: string | null;
  createdAt: number;
  updatedAt: number;
};

/** 持久化 UI 消息行。 */
export type ChatMessageRow = {
  id: string;
  sessionId: string;
  role: string;
  text: string;
  createdAt: number;
  pending: boolean;
  /** JSON：timeline 等扩展字段。 */
  payloadJson: string | null;
};

/** 重排序入参：有序 id 列表，写回 sort_order。 */
export type ReorderInput = {
  orderedIds: string[];
};

/** 移动会话到另一工作空间。 */
export type MoveSessionInput = {
  sessionId: string;
  workspaceId: string;
  /** 目标工作空间内排序；省略则追加到末尾。 */
  sortOrder?: number;
};

/** Preload 暴露的工作空间 / 会话 API。 */
export type ThinkerWorkspacesApi = {
  list(): Promise<WorkspaceRecord[]>;
  create(input: WorkspaceCreateInput): Promise<WorkspaceRecord>;
  rename(id: string, name: string): Promise<WorkspaceRecord>;
  setPinned(id: string, pinned: boolean): Promise<WorkspaceRecord>;
  reorder(input: ReorderInput): Promise<void>;
  remove(id: string): Promise<void>;
  /** 清空工作空间内全部会话（默认工作空间用此代替删除）。 */
  clear(id: string): Promise<void>;
  showInFolder(id: string): Promise<void>;
  /** 工作空间表变更广播。 */
  onChanged(cb: () => void): () => void;

  listSessions(workspaceId?: string): Promise<ChatSessionRecord[]>;
  createSession(workspaceId: string, title?: string): Promise<ChatSessionRecord>;
  getSession(sessionId: string): Promise<{
    session: ChatSessionRecord;
    messages: import("../protocol/message").ChatMessage[];
  } | null>;
  renameSession(sessionId: string, title: string): Promise<ChatSessionRecord>;
  setSessionPinned(sessionId: string, pinned: boolean): Promise<ChatSessionRecord>;
  reorderSessions(workspaceId: string, input: ReorderInput): Promise<void>;
  moveSession(input: MoveSessionInput): Promise<ChatSessionRecord>;
  removeSession(sessionId: string): Promise<void>;
  saveMessages(
    sessionId: string,
    messages: import("../protocol/message").ChatMessage[],
  ): Promise<void>;
  setActiveSession(sessionId: string | null): Promise<void>;
  getActiveSessionId(): Promise<string | null>;
  getLastWorkspaceId(): Promise<string | null>;
  setLastWorkspaceId(workspaceId: string | null): Promise<void>;
  getCollapsedWorkspaceIds(): Promise<string[]>;
  setCollapsedWorkspaceIds(ids: string[]): Promise<void>;
  /** 会话 / 线程列表变更广播。 */
  onThreadsChanged(cb: () => void): () => void;
};
