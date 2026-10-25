/**
 * 工作空间 / 聊天会话元数据与桌面 API 面。
 * 侧栏由 SQLite 权威数据驱动；`ThreadMeta` 经 `agent:listThreads` 下发。
 */
import type { ChatTodo } from "../protocol/todo";

/**
 * 会话运行状态（侧栏圆点 / Resume）。
 * - `cancelled`：用户手动停止（可有 checkpoint → Resume）
 * - `crashed`：进程/utility 异常退出（可有 checkpoint → Resume）
 * - `failed`：业务错误且不可按 checkpoint 续跑
 * HITL 等人期间保持 `running`，不占用本枚举。
 * `queued`：已准入但未占并行槽，等 FIFO 出队后才变为 `running`。
 */
export type SessionRunStatus = "idle" | "running" | "queued" | "cancelled" | "crashed" | "failed";

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
  /** 指定 id（仅内置默认工作空间用固定 id，普通工作空间留空走随机生成）。 */
  id?: string;
};

/** 侧栏会话列表项（`agent:listThreads` 返回）。 */
export type ThreadMeta = {
  id: string;
  sessionId: string;
  workspaceId: string;
  title: string;
  /** 末条消息时间（无消息则为会话创建时间）；侧栏展示与排序用。 */
  updatedAt: number;
  pinned: boolean;
  sortOrder: number;
  runStatus: SessionRunStatus;
  /** FIFO 名次（从 1 起）；仅 `queued` 且账本仍持有该条时有值。 */
  queuePosition?: number;
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
  /**
   * 停跑原因说明（取消文案 / 崩溃信息等）。
   * 列名历史为 interrupt_reason，语义已变为 stopReason。
   */
  interruptReason: string | null;
  createdAt: number;
  /** 末条消息时间（无消息则为会话创建时间）。 */
  updatedAt: number;
  /**
   * 会话待办：会话级状态，独立于计划。
   * 由 `todo` 工具维护；计划产出待办时复用同一份（全量替换，幂等）。
   */
  todos: ChatTodo[];
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

/** 会话导出格式。 */
export type ChatExportFormat = "markdown" | "json";

/** 会话导出入参。 */
export type ChatExportInput = {
  sessionId: string;
  format: ChatExportFormat;
  /**
   * 导出为文件时的目标路径（由主进程的系统保存对话框取得）。
   * 省略则返回内容字符串，由调用方自行处置（如预览）。
   */
  targetPath?: string;
};

/** 会话导出结果。 */
export type ChatExportResult = {
  ok: boolean;
  format: ChatExportFormat;
  /** 保存路径（成功且给了 targetPath 时有值）。 */
  path?: string;
  /** 未落盘时的导出内容（便于 UI 预览或自行保存）。 */
  content?: string;
  fileName?: string;
  error?: string;
};

/** 会话导入入参。 */
export type ChatImportInput = {
  workspaceId: string;
  /** JSON 导出串；省略时由主进程弹系统打开框并读取所选文件。 */
  content?: string;
  /** 导入会话的标题覆盖；省略用导出里的标题。 */
  title?: string;
};

/** 会话导入结果。 */
export type ChatImportResult = {
  ok: boolean;
  /** 新建会话的 id（始终新建，不覆盖既有会话）。 */
  sessionId?: string;
  title?: string;
  /** 导入的消息条数。 */
  messageCount?: number;
  error?: string;
};

/** 会话导出文件版本号；导入时校验，不认识的版本直接拒绝。 */
export const CHAT_EXPORT_VERSION = 1;

/** 全文检索入参。 */
export type ChatSearchInput = {
  /** 检索关键词；空串返回空结果。 */
  query: string;
  /** 限定工作空间；省略表示全部工作空间。 */
  workspaceId?: string;
  /** 返回条数上限。 */
  limit?: number;
};

/** 单条检索命中。 */
export type SearchHit = {
  sessionId: string;
  threadId: string;
  workspaceId: string;
  /** 会话标题（命中标题时的排序权重更高）。 */
  title: string;
  /** 命中的消息序号（从 0 起）；未命中正文时为 null。 */
  messageIndex: number | null;
  /** 命中消息的角色。 */
  role: string | null;
  /** 命中的消息时间；未命中正文时为会话更新时间。 */
  createdAt: number;
  /** 命中片段（纯文本，已去掉换行空白压缩；含 `<mark>` 等标记）。 */
  snippet: string;
  /** 片段内命中区间（相对 snippet 的字符下标）；未定位到时为 null。 */
  snippetMatch: { from: number; to: number } | null;
  /** 是否为标题命中。 */
  titleMatch: boolean;
};

/** 全文检索结果。 */
export type ChatSearchResult = {
  ok: boolean;
  hits: SearchHit[];
  /** 是否因上限截断。 */
  truncated: boolean;
  error?: string;
};

/** 检索结果的默认上限与硬上限（避免大库一次拉爆）。 */
export const DEFAULT_SEARCH_LIMIT = 30;
export const MAX_SEARCH_LIMIT = 100;

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
  /** 全量写回会话待办（会话级状态，独立于计划）。 */
  setSessionTodos(sessionId: string, todos: ChatTodo[]): Promise<ChatSessionRecord>;
  saveMessages(
    sessionId: string,
    messages: import("../protocol/message").ChatMessage[],
  ): Promise<void>;
  /**
   * 将用户附图写入 `{dataDir}/workspaces/{workspaceId}/images/`。
   * 返回路径引用（不含字节）。
   */
  saveChatImage(
    workspaceId: string,
    input: { bytes: Uint8Array; mime: string; name?: string },
  ): Promise<import("../protocol/message").ChatImageRef>;
  /** 按绝对路径读取附图预览 data URL（须在工作空间 images 目录内）。 */
  readChatImagePreview(imagePath: string): Promise<{ dataUrl: string } | null>;
  /**
   * 将工作空间外的文件落盘到 `{dataDir}/workspaces/{workspaceId}/attachments/`。
   * 返回引用（不含字节）；`kind` 由 MIME / 扩展名推断。
   */
  saveAttachment(
    workspaceId: string,
    input: { bytes: Uint8Array; mime: string; name: string },
  ): Promise<import("../protocol/message").ChatAttachmentRef>;
  /**
   * 按 id 读取外部附件预览：图片返回 dataUrl；文档/文本经解析层返回 text。
   * 缺失返回 null。
   */
  readAttachment(
    workspaceId: string,
    id: string,
  ): Promise<{
    name: string;
    size: number;
    mime: string;
    dataUrl?: string | null;
    text?: string | null;
  } | null>;
  /** 读取工作空间内某文件经解析层抽取的纯文本（用于文档悬停预览）。 */
  parseWorkspaceFileText(workspaceId: string, path: string): Promise<{ text: string } | null>;
  setActiveSession(sessionId: string | null): Promise<void>;
  getActiveSessionId(): Promise<string | null>;
  getLastWorkspaceId(): Promise<string | null>;
  setLastWorkspaceId(workspaceId: string | null): Promise<void>;
  getCollapsedWorkspaceIds(): Promise<string[]>;
  setCollapsedWorkspaceIds(ids: string[]): Promise<void>;
  /** 会话 / 线程列表变更广播。 */
  onThreadsChanged(cb: () => void): () => void;
  /** 跨会话全文检索（SQLite FTS5）。 */
  search(input: ChatSearchInput): Promise<ChatSearchResult>;
  /** 导出单个会话为 Markdown / JSON 文件。 */
  exportSession(input: ChatExportInput): Promise<ChatExportResult>;
  /** 导入会话 JSON，落为指定工作区的新会话。 */
  importSession(input: ChatImportInput): Promise<ChatImportResult>;
};
