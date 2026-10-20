/**
 * app_kv 读写：活动会话、工作空间偏好、会话级模型/ChatMode 覆盖。
 */
import {
  type ChatMode,
  isChatMode,
  type ModelSelection,
  normalizeChatMode,
  normalizeModelSelection,
} from "@thinker-workbench/shared";
import { catalog } from "./db";
import { getSession } from "./sessions";
import { getWorkspace } from "./workspaces";

const KV_ACTIVE = "activeSessionId";
const KV_LAST_WORKSPACE = "lastWorkspaceId";
const KV_COLLAPSED = "collapsedWorkspaceIds";
/** 会话级模型选用覆盖，后缀为 sessionId。 */
const KV_SESSION_MODEL_PREFIX = "sessionModelSelection:";
/** 会话级 ChatMode，后缀为 sessionId。 */
const KV_SESSION_CHAT_MODE_PREFIX = "sessionChatMode:";

function getKv(key: string): string | null {
  const row = catalog().prepare("SELECT value FROM app_kv WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setKv(key: string, value: string): void {
  catalog()
    .prepare(
      "INSERT INTO app_kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export { getKv, KV_ACTIVE, KV_SESSION_CHAT_MODE_PREFIX, KV_SESSION_MODEL_PREFIX, setKv };

export function getActiveSessionId(): string | null {
  const v = getKv(KV_ACTIVE);
  return v?.trim() ? v.trim() : null;
}

export function setActiveSessionId(sessionId: string | null): void {
  const next = sessionId?.trim() ?? "";
  setKv(KV_ACTIVE, next);
  // 同步记住所属工作空间，便于无会话时仍能恢复
  if (next) {
    const session = getSession(next);
    if (session) setLastWorkspaceId(session.workspaceId);
  }
}

/** 用户最后选中的工作空间（可与活动会话独立）。 */
export function getLastWorkspaceId(): string | null {
  const v = getKv(KV_LAST_WORKSPACE);
  return v?.trim() ? v.trim() : null;
}

export function setLastWorkspaceId(workspaceId: string | null): void {
  const next = workspaceId?.trim() ?? "";
  if (next && !getWorkspace(next)) {
    setKv(KV_LAST_WORKSPACE, "");
    return;
  }
  setKv(KV_LAST_WORKSPACE, next);
}

export function getCollapsedWorkspaceIds(): string[] {
  const raw = getKv(KV_COLLAPSED);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function setCollapsedWorkspaceIds(ids: string[]): void {
  setKv(KV_COLLAPSED, JSON.stringify(ids));
}

/** 读取会话级模型选用覆盖；无覆盖时返回 null（继承全局）。 */
export function getSessionModelSelection(sessionId: string): ModelSelection | null {
  const id = sessionId?.trim();
  if (!id) return null;
  const raw = getKv(`${KV_SESSION_MODEL_PREFIX}${id}`);
  if (!raw) return null;
  try {
    return normalizeModelSelection(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** 写入会话级模型选用覆盖。 */
export function setSessionModelSelection(sessionId: string, selection: ModelSelection): void {
  const id = sessionId?.trim();
  if (!id) throw new Error("Session id required.");
  setKv(`${KV_SESSION_MODEL_PREFIX}${id}`, JSON.stringify(normalizeModelSelection(selection)));
}

/** 清除会话级模型选用覆盖。 */
export function clearSessionModelSelection(sessionId: string): void {
  const id = sessionId?.trim();
  if (!id) return;
  catalog().prepare("DELETE FROM app_kv WHERE key = ?").run(`${KV_SESSION_MODEL_PREFIX}${id}`);
}

/** 读取会话级 ChatMode（无则 null）。 */
export function getSessionChatMode(sessionId: string): ChatMode | null {
  const id = sessionId?.trim();
  if (!id) return null;
  const raw = getKv(`${KV_SESSION_CHAT_MODE_PREFIX}${id}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isChatMode(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 写入会话级 ChatMode。 */
export function setSessionChatMode(sessionId: string, chatMode: ChatMode): ChatMode {
  const id = sessionId?.trim();
  if (!id) throw new Error("Session id required.");
  const next = normalizeChatMode(chatMode);
  setKv(`${KV_SESSION_CHAT_MODE_PREFIX}${id}`, JSON.stringify(next));
  return next;
}

/** 清除会话级 ChatMode。 */
export function clearSessionChatMode(sessionId: string): void {
  const id = sessionId?.trim();
  if (!id) return;
  catalog().prepare("DELETE FROM app_kv WHERE key = ?").run(`${KV_SESSION_CHAT_MODE_PREFIX}${id}`);
}

/** 活动会话所属工作空间的 root；无活动会话或不存在时返回 null（不再回落首个工作空间）。 */
export function getActiveWorkspaceRoot(): string | null {
  const sessionId = getActiveSessionId();
  if (!sessionId) return null;
  const session = getSession(sessionId);
  if (!session) return null;
  return getWorkspace(session.workspaceId)?.rootPath ?? null;
}
