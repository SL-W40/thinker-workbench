/**
 * 工作空间 / 会话 / listThreads 的 renderer 桥接封装。
 */
import type {
  ChatMessage,
  ChatSessionRecord,
  MoveSessionInput,
  ReorderInput,
  ThreadMeta,
  WorkspaceCreateInput,
  WorkspaceRecord,
} from "@thinker-workbench/shared";

function api() {
  return window.thinker;
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
