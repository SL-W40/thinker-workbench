/**
 * 工作空间 / 会话 / 消息 CRUD。
 * catalog.db 存元数据；每工作空间 chat.db 存会话与消息。
 */
import fs from "node:fs";
import path from "node:path";
import {
  type ChatMessage,
  type ChatSessionRecord,
  createSessionId,
  createThreadId,
  createWorkspaceId,
  type MoveSessionInput,
  type ReorderInput,
  type SessionRunStatus,
  type ThreadMeta,
  type WorkspaceCreateInput,
  type WorkspaceRecord,
} from "@thinker-workbench/shared";
import type Database from "better-sqlite3";
import { getDefaultWorkspaceRoot } from "../config/paths";
import { getGeneralSettings } from "../config/settingsStore";
import { peekThreadCheckpoint } from "./checkpointClear";
import {
  destroyWorkspaceChatDb,
  openCatalogDb,
  openWorkspaceChatDb,
} from "./thinkerDb";

type WsRow = {
  id: string;
  name: string;
  root_path: string;
  pinned: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

type SessionRow = {
  id: string;
  thread_id: string;
  workspace_id: string;
  title: string;
  pinned: number;
  sort_order: number;
  run_status: string;
  active_run_id: string | null;
  interrupt_reason: string | null;
  created_at: number;
  updated_at: number;
};

type MsgRow = {
  id: string;
  session_id: string;
  role: string;
  text: string;
  created_at: number;
  pending: number;
  payload_json: string | null;
  seq: number;
};

const KV_ACTIVE = "activeSessionId";
const KV_LAST_WORKSPACE = "lastWorkspaceId";
const KV_COLLAPSED = "collapsedWorkspaceIds";

function catalog(): Database.Database {
  return openCatalogDb();
}

function chatDb(workspaceId: string): Database.Database {
  return openWorkspaceChatDb(workspaceId);
}

function requireWorkspace(id: string): WorkspaceRecord {
  const row = getWorkspace(id);
  if (!row) throw new Error("Workspace not found.");
  return row;
}

function requireSession(workspaceId: string, id: string): ChatSessionRecord {
  const row = getSessionInWorkspace(workspaceId, id);
  if (!row) throw new Error("Session not found.");
  return row;
}

/** 是否为内置默认工作空间根（`~/.thinker/workspace`）。 */
export function isDefaultWorkspaceRoot(rootPath: string): boolean {
  return path.resolve(rootPath) === path.resolve(getDefaultWorkspaceRoot());
}

function mapWorkspace(row: WsRow): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    pinned: row.pinned === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDefault: isDefaultWorkspaceRoot(row.root_path),
  };
}

function mapSession(row: SessionRow): ChatSessionRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    workspaceId: row.workspace_id,
    title: row.title,
    pinned: row.pinned === 1,
    sortOrder: row.sort_order,
    runStatus: normalizeRunStatus(row.run_status, row.interrupt_reason),
    activeRunId: row.active_run_id,
    interruptReason: row.interrupt_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 读盘时迁移旧 `interrupted` → cancelled / crashed。 */
function normalizeRunStatus(value: string, interruptReason?: string | null): SessionRunStatus {
  if (value === "idle" || value === "running" || value === "cancelled" || value === "crashed" || value === "failed") {
    return value;
  }
  if (value === "interrupted") {
    const reason = (interruptReason ?? "").toLowerCase();
    if (reason.includes("crash") || reason.includes("exit") || reason.includes("utility")) {
      return "crashed";
    }
    return "cancelled";
  }
  return "idle";
}

function mapThread(row: SessionRow): ThreadMeta {
  return {
    id: row.thread_id,
    sessionId: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    updatedAt: row.updated_at,
    pinned: row.pinned === 1,
    sortOrder: row.sort_order,
    runStatus: normalizeRunStatus(row.run_status, row.interrupt_reason),
  };
}

function indexSession(sessionId: string, threadId: string, workspaceId: string): void {
  catalog()
    .prepare(
      `INSERT INTO session_index(session_id, thread_id, workspace_id)
       VALUES(?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         workspace_id = excluded.workspace_id`,
    )
    .run(sessionId, threadId, workspaceId);
}

function unindexSession(sessionId: string): void {
  catalog().prepare("DELETE FROM session_index WHERE session_id = ?").run(sessionId);
}

function lookupIndexBySession(sessionId: string): string | null {
  const row = catalog()
    .prepare("SELECT workspace_id FROM session_index WHERE session_id = ?")
    .get(sessionId) as { workspace_id: string } | undefined;
  return row?.workspace_id ?? null;
}

function lookupIndexByThread(threadId: string): { sessionId: string; workspaceId: string } | null {
  const row = catalog()
    .prepare("SELECT session_id, workspace_id FROM session_index WHERE thread_id = ?")
    .get(threadId) as { session_id: string; workspace_id: string } | undefined;
  return row ? { sessionId: row.session_id, workspaceId: row.workspace_id } : null;
}

function nextWorkspaceSortOrder(): number {
  const row = catalog()
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM workspaces")
    .get() as { m: number };
  return row.m + 1;
}

function nextSessionSortOrder(workspaceId: string): number {
  const row = chatDb(workspaceId)
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM chat_sessions")
    .get() as { m: number };
  return row.m + 1;
}

export function listWorkspaces(): WorkspaceRecord[] {
  const rows = catalog()
    .prepare(
      `SELECT * FROM workspaces
       ORDER BY pinned DESC, sort_order ASC, updated_at DESC`,
    )
    .all() as WsRow[];
  return rows.map(mapWorkspace);
}

/**
 * 确保内置默认工作空间存在（根目录 `~/.thinker/workspace`）。
 * 默认空间不可删除，仅可清空会话；缺失时会补建（即使已有其它工作空间）。
 */
export function ensureDefaultWorkspace(): WorkspaceRecord | null {
  const rootPath = path.resolve(getDefaultWorkspaceRoot());
  const existing = catalog()
    .prepare("SELECT * FROM workspaces WHERE root_path = ?")
    .get(rootPath) as WsRow | undefined;
  if (existing) {
    openWorkspaceChatDb(existing.id);
    if (!getLastWorkspaceId()) setLastWorkspaceId(existing.id);
    return mapWorkspace(existing);
  }

  fs.mkdirSync(rootPath, { recursive: true });
  const name = getGeneralSettings().uiLocale === "zh" ? "默认工作空间" : "Default workspace";
  const created = createWorkspace({ rootPath, name });
  if (!getLastWorkspaceId()) setLastWorkspaceId(created.id);
  return created;
}

export function getWorkspace(id: string): WorkspaceRecord | null {
  const row = catalog().prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as
    | WsRow
    | undefined;
  return row ? mapWorkspace(row) : null;
}

export function createWorkspace(input: WorkspaceCreateInput): WorkspaceRecord {
  const rootPath = path.resolve(input.rootPath.trim());
  if (!rootPath || !fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    throw new Error("Workspace directory does not exist.");
  }
  const existing = catalog()
    .prepare("SELECT * FROM workspaces WHERE root_path = ?")
    .get(rootPath) as WsRow | undefined;
  if (existing) {
    openWorkspaceChatDb(existing.id);
    return mapWorkspace(existing);
  }

  const now = Date.now();
  const id = createWorkspaceId();
  const name = (input.name?.trim() || path.basename(rootPath) || "Workspace").slice(0, 120);
  const sortOrder = nextWorkspaceSortOrder();
  catalog()
    .prepare(
      `INSERT INTO workspaces(id, name, root_path, pinned, sort_order, created_at, updated_at)
       VALUES(?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(id, name, rootPath, sortOrder, now, now);
  openWorkspaceChatDb(id);
  return requireWorkspace(id);
}

/**
 * 设置工作空间侧栏别名（不改磁盘目录）。
 * 空串则回落为 `rootPath` 的文件夹名。
 */
export function renameWorkspace(id: string, name: string): WorkspaceRecord {
  const ws = requireWorkspace(id);
  const trimmed = name.trim().slice(0, 120);
  const next = trimmed || path.basename(ws.rootPath) || "Workspace";
  const now = Date.now();
  catalog()
    .prepare("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?")
    .run(next, now, id);
  return requireWorkspace(id);
}

export function setWorkspacePinned(id: string, pinned: boolean): WorkspaceRecord {
  const now = Date.now();
  const r = catalog()
    .prepare("UPDATE workspaces SET pinned = ?, updated_at = ? WHERE id = ?")
    .run(pinned ? 1 : 0, now, id);
  if (r.changes === 0) throw new Error("Workspace not found.");
  return requireWorkspace(id);
}

export function reorderWorkspaces(input: ReorderInput): void {
  const upd = catalog().prepare("UPDATE workspaces SET sort_order = ?, updated_at = ? WHERE id = ?");
  const now = Date.now();
  const tx = catalog().transaction((ids: string[]) => {
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      if (id) upd.run(index, now, id);
    }
  });
  tx(input.orderedIds);
}

export function removeWorkspace(id: string): void {
  const ws = requireWorkspace(id);
  if (ws.isDefault) {
    throw new Error("Default workspace cannot be deleted. Clear chats instead.");
  }
  const r = catalog().prepare("DELETE FROM workspaces WHERE id = ?").run(id);
  if (r.changes === 0) throw new Error("Workspace not found.");
  destroyWorkspaceChatDb(id);
  const active = getKv(KV_ACTIVE);
  if (active && !lookupIndexBySession(active)) setKv(KV_ACTIVE, "");
  if (getLastWorkspaceId() === id) setLastWorkspaceId(null);
}

/**
 * 清空工作空间内全部会话与消息（保留工作空间目录与元数据）。
 * @returns 被删除会话的 threadId 列表（供清理 checkpoint）。
 */
export function clearWorkspace(id: string): string[] {
  requireWorkspace(id);
  const sessions = listSessions(id);
  const threadIds = sessions.map((s) => s.threadId);
  for (const s of sessions) {
    removeSession(s.id);
  }
  return threadIds;
}

export function listThreads(workspaceId?: string): ThreadMeta[] {
  if (workspaceId) {
    const rows = chatDb(workspaceId)
      .prepare(
        `SELECT * FROM chat_sessions
         ORDER BY pinned DESC, sort_order ASC, updated_at DESC`,
      )
      .all() as SessionRow[];
    return rows.map(mapThread);
  }
  const out: ThreadMeta[] = [];
  for (const ws of listWorkspaces()) {
    out.push(...listThreads(ws.id));
  }
  return out.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return b.updatedAt - a.updatedAt;
  });
}

export function listSessions(workspaceId?: string): ChatSessionRecord[] {
  const out: ChatSessionRecord[] = [];
  for (const th of listThreads(workspaceId)) {
    const s = getSession(th.sessionId);
    if (s) out.push(s);
  }
  return out;
}

function getSessionInWorkspace(workspaceId: string, sessionId: string): ChatSessionRecord | null {
  const row = chatDb(workspaceId)
    .prepare("SELECT * FROM chat_sessions WHERE id = ?")
    .get(sessionId) as SessionRow | undefined;
  return row ? mapSession(row) : null;
}

export function getSession(sessionId: string): ChatSessionRecord | null {
  const workspaceId = lookupIndexBySession(sessionId);
  if (!workspaceId) return null;
  return getSessionInWorkspace(workspaceId, sessionId);
}

export function getSessionByThreadId(threadId: string): ChatSessionRecord | null {
  const hit = lookupIndexByThread(threadId);
  if (!hit) return null;
  return getSessionInWorkspace(hit.workspaceId, hit.sessionId);
}

export function createSession(workspaceId: string, title?: string): ChatSessionRecord {
  if (!getWorkspace(workspaceId)) throw new Error("Workspace not found.");
  const now = Date.now();
  const id = createSessionId();
  const threadId = createThreadId();
  const sortOrder = nextSessionSortOrder(workspaceId);
  const sessionTitle = (title?.trim() || "New chat").slice(0, 120);
  chatDb(workspaceId)
    .prepare(
      `INSERT INTO chat_sessions(
         id, thread_id, workspace_id, title, pinned, sort_order,
         run_status, active_run_id, interrupt_reason, created_at, updated_at
       ) VALUES(?, ?, ?, ?, 0, ?, 'idle', NULL, NULL, ?, ?)`,
    )
    .run(id, threadId, workspaceId, sessionTitle, sortOrder, now, now);
  indexSession(id, threadId, workspaceId);
  return requireSession(workspaceId, id);
}

export function upsertSessionForRun(options: {
  threadId: string;
  workspaceId?: string;
  titleHint?: string;
  runStatus?: SessionRunStatus;
  activeRunId?: string | null;
  interruptReason?: string | null;
}): ChatSessionRecord {
  const existing = getSessionByThreadId(options.threadId);
  const now = Date.now();
  if (!existing) {
    const workspaceId = options.workspaceId;
    if (!workspaceId) throw new Error("Cannot create session without workspaceId.");
    if (!getWorkspace(workspaceId)) throw new Error("Workspace not found.");
    const id = createSessionId();
    const sortOrder = nextSessionSortOrder(workspaceId);
    const title = (options.titleHint?.trim() || "New chat").slice(0, 48);
    chatDb(workspaceId)
      .prepare(
        `INSERT INTO chat_sessions(
           id, thread_id, workspace_id, title, pinned, sort_order,
           run_status, active_run_id, interrupt_reason, created_at, updated_at
         ) VALUES(?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        options.threadId,
        workspaceId,
        title,
        sortOrder,
        options.runStatus ?? "running",
        options.activeRunId ?? null,
        options.interruptReason ?? null,
        now,
        now,
      );
    indexSession(id, options.threadId, workspaceId);
    return requireSession(workspaceId, id);
  }

  const title =
    options.titleHint && existing.title === "New chat"
      ? options.titleHint.trim().slice(0, 48)
      : existing.title;
  const runStatus = options.runStatus ?? existing.runStatus;
  const activeRunId =
    options.activeRunId !== undefined ? options.activeRunId : existing.activeRunId;
  const interruptReason =
    options.interruptReason !== undefined ? options.interruptReason : existing.interruptReason;
  chatDb(existing.workspaceId)
    .prepare(
      `UPDATE chat_sessions SET
         title = ?, run_status = ?, active_run_id = ?, interrupt_reason = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(title, runStatus, activeRunId, interruptReason, now, existing.id);
  return requireSession(existing.workspaceId, existing.id);
}

export function setSessionRunStatus(
  sessionIdOrThreadId: string,
  status: SessionRunStatus,
  options?: { activeRunId?: string | null; interruptReason?: string | null; byThread?: boolean },
): void {
  const session = options?.byThread
    ? getSessionByThreadId(sessionIdOrThreadId)
    : getSession(sessionIdOrThreadId);
  if (!session) return;
  const now = Date.now();
  const activeRunId =
    options?.activeRunId !== undefined ? options.activeRunId : session.activeRunId;
  const interruptReason =
    options?.interruptReason !== undefined ? options.interruptReason : session.interruptReason;
  chatDb(session.workspaceId)
    .prepare(
      `UPDATE chat_sessions SET
         run_status = ?, active_run_id = ?, interrupt_reason = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(status, activeRunId, interruptReason, now, session.id);
}

/** 统计仍在 running 的会话数（跨工作空间）。 */
export function countRunningSessions(): number {
  let n = 0;
  for (const ws of listWorkspaces()) {
    const row = chatDb(ws.id)
      .prepare("SELECT COUNT(*) AS c FROM chat_sessions WHERE run_status = 'running'")
      .get() as { c: number };
    n += row?.c ?? 0;
  }
  return n;
}

/**
 * 进程退出 / 启动时愈合会话状态：
 * - `running` 且有 checkpoint → `crashed`（可 Resume）
 * - `running` 且无 checkpoint → `failed`，收束 pending 消息
 * - 旧 `interrupted` / `failed` 仍有 checkpoint → `crashed`（修复旧版误标）
 * - 非 running 且无 checkpoint、却仍有 pending 助手消息 → 收束，避免永远 Planning
 */
export function healRunningSessions(): number {
  let changes = 0;
  const now = Date.now();

  for (const ws of listWorkspaces()) {
    const db = chatDb(ws.id);
    const rows = db
      .prepare(
        `SELECT id, thread_id, run_status, interrupt_reason FROM chat_sessions
         WHERE run_status IN ('running', 'interrupted', 'cancelled', 'crashed', 'failed')`,
      )
      .all() as Array<{
      id: string;
      thread_id: string;
      run_status: string;
      interrupt_reason: string | null;
    }>;

    for (const row of rows) {
      const ckpt = peekThreadCheckpoint(row.thread_id);
      if (ckpt) {
        const dirtyReason = /no pending interrupt|tool_approval/i.test(
          row.interrupt_reason ?? "",
        );
        const alreadyCrashed = row.run_status === "crashed" && !dirtyReason;
        const alreadyCancelled =
          row.run_status === "cancelled" &&
          (row.interrupt_reason ?? "").toLowerCase() === "cancelled" &&
          !dirtyReason;
        // 启动愈合：残留 running / 旧 interrupted → crashed；保留用户 cancelled
        if (row.run_status === "cancelled" && !dirtyReason) {
          continue;
        }
        if (!alreadyCrashed && !alreadyCancelled) {
          db.prepare(
            `UPDATE chat_sessions
             SET run_status = 'crashed',
                 interrupt_reason = ?,
                 updated_at = ?
             WHERE id = ?`,
          ).run("crash", now, row.id);
          changes += 1;
        } else if (dirtyReason) {
          db.prepare(
            `UPDATE chat_sessions
             SET run_status = 'crashed',
                 interrupt_reason = ?,
                 updated_at = ?
             WHERE id = ?`,
          ).run("crash", now, row.id);
          changes += 1;
        }
        continue;
      }

      if (row.run_status === "running") {
        db.prepare(
          `UPDATE chat_sessions
           SET run_status = 'failed',
               active_run_id = NULL,
               interrupt_reason = COALESCE(interrupt_reason, ?),
               updated_at = ?
           WHERE id = ?`,
        ).run("Process exited before the run could be checkpointed.", now, row.id);
        finalizeOrphanPendingMessages(ws.id, row.id, "Run interrupted by process restart.");
        changes += 1;
        continue;
      }

      // cancelled/crashed/interrupted/failed 但无 checkpoint：若仍有 pending 气泡则收束
      const pending = db
        .prepare(
          `SELECT COUNT(*) AS c FROM chat_messages
           WHERE session_id = ? AND pending = 1 AND role = 'assistant'`,
        )
        .get(row.id) as { c: number };
      if ((pending?.c ?? 0) > 0) {
        finalizeOrphanPendingMessages(ws.id, row.id, "Run interrupted by process restart.");
        if (
          row.run_status === "interrupted" ||
          row.run_status === "cancelled" ||
          row.run_status === "crashed"
        ) {
          db.prepare(
            `UPDATE chat_sessions
             SET run_status = 'failed',
                 active_run_id = NULL,
                 interrupt_reason = COALESCE(interrupt_reason, ?),
                 updated_at = ?
             WHERE id = ?`,
          ).run("No checkpoint to resume.", now, row.id);
        }
        changes += 1;
      }
    }
  }
  return changes;
}

/** 将会话中仍 pending 的助手消息标为失败，避免 UI 永久 Planning。 */
function finalizeOrphanPendingMessages(
  workspaceId: string,
  sessionId: string,
  errorText: string,
): void {
  const db = chatDb(workspaceId);
  const rows = db
    .prepare(
      `SELECT id, text, payload_json FROM chat_messages
       WHERE session_id = ? AND pending = 1 AND role = 'assistant'`,
    )
    .all(sessionId) as Array<{ id: string; text: string; payload_json: string | null }>;
  if (rows.length === 0) return;

  const upd = db.prepare(
    `UPDATE chat_messages SET pending = 0, payload_json = ? WHERE id = ?`,
  );
  const tx = db.transaction(() => {
    for (const row of rows) {
      let timeline: unknown[] = [];
      if (row.payload_json) {
        try {
          const parsed = JSON.parse(row.payload_json) as { timeline?: unknown[] };
          if (Array.isArray(parsed.timeline)) timeline = parsed.timeline;
        } catch {
          /* ignore */
        }
      }
      // 关掉活动 thinking，并追加错误步
      timeline = timeline.map((step) => {
        if (step && typeof step === "object" && (step as { kind?: string }).kind === "status") {
          return { ...step, active: false };
        }
        return step;
      });
      timeline.push({
        id: `tl_heal_${row.id}`,
        kind: "error",
        message: errorText,
        // 无 checkpoint 的进程中断：按异常退出展示，便于时间线「继续」识别
        code: "PROCESS_EXIT",
      });
      upd.run(JSON.stringify({ timeline, pending: false }), row.id);
    }
  });
  tx();
}

export function renameSession(sessionId: string, title: string): ChatSessionRecord {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found.");
  const trimmed = title.trim().slice(0, 120);
  if (!trimmed) throw new Error("Title is empty.");
  const now = Date.now();
  chatDb(session.workspaceId)
    .prepare("UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?")
    .run(trimmed, now, sessionId);
  return requireSession(session.workspaceId, sessionId);
}

export function setSessionPinned(sessionId: string, pinned: boolean): ChatSessionRecord {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found.");
  const now = Date.now();
  chatDb(session.workspaceId)
    .prepare("UPDATE chat_sessions SET pinned = ?, updated_at = ? WHERE id = ?")
    .run(pinned ? 1 : 0, now, sessionId);
  return requireSession(session.workspaceId, sessionId);
}

export function reorderSessions(workspaceId: string, input: ReorderInput): void {
  const upd = chatDb(workspaceId).prepare(
    "UPDATE chat_sessions SET sort_order = ?, updated_at = ? WHERE id = ?",
  );
  const now = Date.now();
  const tx = chatDb(workspaceId).transaction((ids: string[]) => {
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      if (id) upd.run(index, now, id);
    }
  });
  tx(input.orderedIds);
}

export function moveSession(input: MoveSessionInput): ChatSessionRecord {
  if (!getWorkspace(input.workspaceId)) throw new Error("Workspace not found.");
  const session = getSession(input.sessionId);
  if (!session) throw new Error("Session not found.");
  if (session.workspaceId === input.workspaceId) {
    if (typeof input.sortOrder === "number") {
      chatDb(input.workspaceId)
        .prepare("UPDATE chat_sessions SET sort_order = ?, updated_at = ? WHERE id = ?")
        .run(input.sortOrder, Date.now(), input.sessionId);
    }
    return requireSession(input.workspaceId, input.sessionId);
  }

  const messages = loadMessages(input.sessionId);
  const now = Date.now();
  const sortOrder =
    typeof input.sortOrder === "number"
      ? input.sortOrder
      : nextSessionSortOrder(input.workspaceId);

  const dest = chatDb(input.workspaceId);
  dest
    .prepare(
      `INSERT INTO chat_sessions(
         id, thread_id, workspace_id, title, pinned, sort_order,
         run_status, active_run_id, interrupt_reason, created_at, updated_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      session.id,
      session.threadId,
      input.workspaceId,
      session.title,
      session.pinned ? 1 : 0,
      sortOrder,
      session.runStatus,
      session.activeRunId,
      session.interruptReason,
      session.createdAt,
      now,
    );
  saveMessagesToDb(input.workspaceId, input.sessionId, messages);
  chatDb(session.workspaceId).prepare("DELETE FROM chat_sessions WHERE id = ?").run(session.id);
  indexSession(session.id, session.threadId, input.workspaceId);
  return requireSession(input.workspaceId, input.sessionId);
}

export function removeSession(sessionId: string): void {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found.");
  chatDb(session.workspaceId).prepare("DELETE FROM chat_sessions WHERE id = ?").run(sessionId);
  unindexSession(sessionId);
  if (getKv(KV_ACTIVE) === sessionId) setKv(KV_ACTIVE, "");
}

function saveMessagesToDb(workspaceId: string, sessionId: string, messages: ChatMessage[]): void {
  const db = chatDb(workspaceId);
  const del = db.prepare("DELETE FROM chat_messages WHERE session_id = ?");
  const ins = db.prepare(
    `INSERT INTO chat_messages(id, session_id, role, text, created_at, pending, payload_json, seq)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = Date.now();
  const tx = db.transaction(() => {
    del.run(sessionId);
    for (let seq = 0; seq < messages.length; seq++) {
      const m = messages[seq];
      if (!m) continue;
      // 落库前冻结思考耗时：有 durationMs 则丢掉 startedAt，避免下次 hydrate 按墙钟重算
      const timeline = m.timeline?.map((step) => {
        if (step.kind !== "status" || step.status !== "thinking") return step;
        if (step.durationMs == null) {
          return { ...step, active: false, startedAt: undefined };
        }
        return { ...step, active: false, startedAt: undefined, durationMs: step.durationMs };
      });
      const hasPayload =
        timeline ||
        m.pending ||
        m.usage ||
        m.durationMs != null ||
        m.runStartedAt != null ||
        Boolean(m.traceId);
      const payload = hasPayload
        ? JSON.stringify({
            timeline,
            pending: m.pending,
            usage: m.usage,
            durationMs: m.durationMs,
            // 已结束消息不持久化 live 计时锚点
            runStartedAt: m.pending ? m.runStartedAt : undefined,
            traceId: m.traceId,
          })
        : null;
      ins.run(m.id, sessionId, m.role, m.text, m.createdAt ?? now, m.pending ? 1 : 0, payload, seq);
    }
    db.prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?").run(now, sessionId);
  });
  tx();
}

export function saveMessages(sessionId: string, messages: ChatMessage[]): void {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found.");
  saveMessagesToDb(session.workspaceId, sessionId, messages);
}

export function loadMessages(sessionId: string): ChatMessage[] {
  const session = getSession(sessionId);
  if (!session) return [];
  const rows = chatDb(session.workspaceId)
    .prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY seq ASC, created_at ASC")
    .all(sessionId) as MsgRow[];
  return rows.map((row) => {
    let timeline: ChatMessage["timeline"];
    let pending = row.pending === 1;
    let usage: ChatMessage["usage"];
    let durationMs: number | undefined;
    let runStartedAt: number | undefined;
    let traceId: string | undefined;
    if (row.payload_json) {
      try {
        const parsed = JSON.parse(row.payload_json) as {
          timeline?: ChatMessage["timeline"];
          pending?: boolean;
          usage?: ChatMessage["usage"];
          durationMs?: number;
          runStartedAt?: number;
          traceId?: string;
        };
        timeline = parsed.timeline;
        if (typeof parsed.pending === "boolean") pending = parsed.pending;
        if (parsed.usage) usage = parsed.usage;
        if (typeof parsed.durationMs === "number") durationMs = parsed.durationMs;
        if (typeof parsed.runStartedAt === "number") runStartedAt = parsed.runStartedAt;
        if (typeof parsed.traceId === "string" && parsed.traceId.trim()) {
          traceId = parsed.traceId.trim();
        }
      } catch {
        /* ignore */
      }
    }
    return {
      id: row.id,
      role: row.role as ChatMessage["role"],
      text: row.text,
      createdAt: row.created_at,
      pending: pending || undefined,
      timeline,
      usage,
      durationMs,
      runStartedAt,
      traceId,
    };
  });
}

export function getSessionWithMessages(sessionId: string): {
  session: ChatSessionRecord;
  messages: ChatMessage[];
} | null {
  const session = getSession(sessionId);
  if (!session) return null;
  return { session, messages: loadMessages(sessionId) };
}

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

/** 活动会话所属工作空间的 root；无活动会话或不存在时返回 null（不再回落首个工作空间）。 */
export function getActiveWorkspaceRoot(): string | null {
  const sessionId = getActiveSessionId();
  if (!sessionId) return null;
  const session = getSession(sessionId);
  if (!session) return null;
  return getWorkspace(session.workspaceId)?.rootPath ?? null;
}

export function assertWorkspaceRoot(rootPath: string): string {
  const resolved = path.resolve(rootPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Workspace root does not exist: ${resolved}`);
  }
  return resolved;
}
