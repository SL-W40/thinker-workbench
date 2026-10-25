/**
 * 工作空间 / 会话 / listThreads 的 renderer 桥接封装。
 */
import type {
  ChatAttachmentRef,
  ChatExportInput,
  ChatExportResult,
  ChatImportInput,
  ChatImportResult,
  ChatMessage,
  ChatSearchInput,
  ChatSearchResult,
  ChatSessionRecord,
  ChatTodo,
  MoveSessionInput,
  ReorderInput,
  ThreadMeta,
  WorkspaceCreateInput,
  WorkspaceRecord,
} from "@thinker-workbench/shared";

function api() {
  return window.thinker;
}

/** 跨会话全文检索；桌面桥接不可用时返回空结果，不至于让侧栏崩。 */
export async function searchSessions(input: ChatSearchInput): Promise<ChatSearchResult> {
  const res = await api()?.workspaces?.search(input);
  return res ?? { ok: false, hits: [], truncated: false };
}

/**
 * 导出会话到文件（由主进程弹保存框）。
 * 桥接缺失时返回失败回执而不是抛异常。
 */
export async function exportSessionFile(input: ChatExportInput): Promise<ChatExportResult> {
  const res = await api()?.workspaces?.exportSession(input);
  return res ?? { ok: false, format: input.format, error: "桥接不可用" };
}

/** 导入会话 JSON（省略 content 时由主进程弹打开框）。 */
export async function importSessionFile(input: ChatImportInput): Promise<ChatImportResult> {
  const res = await api()?.workspaces?.importSession(input);
  return res ?? { ok: false, error: "桥接不可用" };
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  return api()?.workspaces?.list() ?? [];
}

export async function createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceRecord> {
  const ws = api()?.workspaces;
  if (!ws) throw new Error("Workspaces API unavailable.");
  return ws.create(input);
}

export async function renameWorkspace(id: string, name: string): Promise<WorkspaceRecord> {
  const ws = api()?.workspaces;
  if (!ws) throw new Error("Workspaces API unavailable.");
  return ws.rename(id, name);
}

export async function setWorkspacePinned(id: string, pinned: boolean): Promise<WorkspaceRecord> {
  const ws = api()?.workspaces;
  if (!ws) throw new Error("Workspaces API unavailable.");
  return ws.setPinned(id, pinned);
}

export async function reorderWorkspaces(input: ReorderInput): Promise<void> {
  await api()?.workspaces?.reorder(input);
}

export async function removeWorkspace(id: string): Promise<void> {
  await api()?.workspaces?.remove(id);
}

export async function clearWorkspace(id: string): Promise<void> {
  const ws = api()?.workspaces;
  if (!ws?.clear) throw new Error("Workspaces API unavailable.");
  await ws.clear(id);
}

export async function showWorkspaceInFolder(id: string): Promise<void> {
  await api()?.workspaces?.showInFolder(id);
}

export function onWorkspacesChanged(cb: () => void): () => void {
  return api()?.workspaces?.onChanged(cb) ?? (() => undefined);
}

export async function listThreads(): Promise<ThreadMeta[]> {
  return api()?.listThreads?.() ?? [];
}

export function onThreadsChanged(cb: () => void): () => void {
  return api()?.workspaces?.onThreadsChanged(cb) ?? (() => undefined);
}

export async function createSession(
  workspaceId: string,
  title?: string,
): Promise<ChatSessionRecord> {
  const ws = api()?.workspaces;
  if (!ws) throw new Error("Workspaces API unavailable.");
  return ws.createSession(workspaceId, title);
}

export async function getSession(sessionId: string): Promise<{
  session: ChatSessionRecord;
  messages: ChatMessage[];
} | null> {
  return api()?.workspaces?.getSession(sessionId) ?? null;
}

export async function renameSession(sessionId: string, title: string): Promise<ChatSessionRecord> {
  const ws = api()?.workspaces;
  if (!ws) throw new Error("Workspaces API unavailable.");
  return ws.renameSession(sessionId, title);
}

/** 全量写回会话待办（会话级状态，独立于计划）。 */
export async function setSessionTodos(
  sessionId: string,
  todos: ChatTodo[],
): Promise<ChatSessionRecord> {
  const ws = api()?.workspaces;
  if (!ws?.setSessionTodos) throw new Error("Workspaces API unavailable.");
  return ws.setSessionTodos(sessionId, todos);
}

export async function setSessionPinned(
  sessionId: string,
  pinned: boolean,
): Promise<ChatSessionRecord> {
  const ws = api()?.workspaces;
  if (!ws) throw new Error("Workspaces API unavailable.");
  return ws.setSessionPinned(sessionId, pinned);
}

export async function reorderSessions(workspaceId: string, input: ReorderInput): Promise<void> {
  await api()?.workspaces?.reorderSessions(workspaceId, input);
}

export async function moveSession(input: MoveSessionInput): Promise<ChatSessionRecord> {
  const ws = api()?.workspaces;
  if (!ws) throw new Error("Workspaces API unavailable.");
  return ws.moveSession(input);
}

export async function removeSession(sessionId: string): Promise<void> {
  await api()?.workspaces?.removeSession(sessionId);
}

export async function saveSessionMessages(
  sessionId: string,
  messages: ChatMessage[],
): Promise<void> {
  await api()?.workspaces?.saveMessages(sessionId, messages);
}

/** 将用户附图写入工作空间 images 目录。 */
export async function saveChatImage(
  workspaceId: string,
  input: { bytes: Uint8Array; mime: string; name?: string },
): Promise<import("@thinker-workbench/shared").ChatImageRef> {
  const ws = api()?.workspaces;
  if (!ws?.saveChatImage) throw new Error("Chat images API unavailable.");
  return ws.saveChatImage(workspaceId, input);
}

/** 读取已落盘附图预览 data URL。 */
export async function readChatImagePreview(imagePath: string): Promise<{ dataUrl: string } | null> {
  return api()?.workspaces?.readChatImagePreview(imagePath) ?? null;
}

/** 落盘外部附件（dataDir/attachments）。 */
export async function saveAttachment(
  workspaceId: string,
  input: { bytes: Uint8Array; mime: string; name: string },
): Promise<ChatAttachmentRef> {
  const ws = api()?.workspaces;
  if (!ws?.saveAttachment) throw new Error("Attachments API unavailable.");
  return ws.saveAttachment(workspaceId, input);
}

/** 读取外部附件预览（图片 dataUrl / 文档解析文本）。 */
export async function readAttachment(
  workspaceId: string,
  id: string,
): Promise<{
  name: string;
  size: number;
  mime: string;
  dataUrl?: string | null;
  text?: string | null;
} | null> {
  return api()?.workspaces?.readAttachment(workspaceId, id) ?? null;
}

/** 读取工作空间内文件经解析层抽取的纯文本。 */
export async function parseWorkspaceFileText(
  workspaceId: string,
  path: string,
): Promise<{ text: string } | null> {
  return api()?.workspaces?.parseWorkspaceFileText(workspaceId, path) ?? null;
}

export async function setActiveSession(sessionId: string | null): Promise<void> {
  await api()?.workspaces?.setActiveSession(sessionId);
}

export async function getActiveSessionId(): Promise<string | null> {
  return api()?.workspaces?.getActiveSessionId() ?? null;
}

export async function listSessions(workspaceId?: string): Promise<ChatSessionRecord[]> {
  return api()?.workspaces?.listSessions(workspaceId) ?? [];
}

export async function getLastWorkspaceId(): Promise<string | null> {
  return api()?.workspaces?.getLastWorkspaceId() ?? null;
}

export async function setLastWorkspaceId(workspaceId: string | null): Promise<void> {
  await api()?.workspaces?.setLastWorkspaceId(workspaceId);
}

export async function getCollapsedWorkspaceIds(): Promise<string[]> {
  return api()?.workspaces?.getCollapsedWorkspaceIds() ?? [];
}

export async function setCollapsedWorkspaceIds(ids: string[]): Promise<void> {
  await api()?.workspaces?.setCollapsedWorkspaceIds(ids);
}
