/**
 * 会话 / 线程 CRUD 与运行态愈合（chat.db chat_sessions 表）。
 */
import {
  type ChatSessionRecord,
  createSessionId,
  createThreadId,
  type MoveSessionInput,
  type ReorderInput,
  type SessionRunStatus,
  type ThreadMeta,
} from "@thinker-workbench/shared";
import { peekThreadCheckpoint } from "../checkpointClear";
import { buildOrphanHealPayload } from "../orphanHeal";
import { planQueuedHeal } from "../queuedHeal";
import { purgeSessionArtifacts } from "../sessionArtifacts";
import { chatDb, type SessionRow } from "./db";
import { clearSessionChatMode, clearSessionModelSelection, getKv, KV_ACTIVE, setKv } from "./kv";
import { loadMessages, saveMessagesToDb } from "./messages";
import { mapSession, mapThread } from "./rows";
import {
  indexSession,
  lookupIndexBySession,
  lookupIndexByThread,
  unindexSession,
} from "./sessionIndex";
import { getWorkspace, listWorkspaces } from "./workspaces";

function requireSession(workspaceId: string, id: string): ChatSessionRecord {
  const row = getSessionInWorkspace(workspaceId, id);
  if (!row) throw new Error("Session not found.");
  return row;
}

function nextSessionSortOrder(workspaceId: string): number {
  const row = chatDb(workspaceId)
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM chat_sessions")
    .get() as { m: number };
  return row.m + 1;
}

export function listThreads(workspaceId?: string): ThreadMeta[] {
  if (workspaceId) {
    const rows = chatDb(workspaceId)
      .prepare(
        `SELECT * FROM chat_sessions
         ORDER BY pinned DESC, updated_at DESC, sort_order ASC`,
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
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
    return a.sortOrder - b.sortOrder;
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
  // 不碰 updated_at：侧栏时间/排序跟末条消息，与跑状态无关
  chatDb(existing.workspaceId)
    .prepare(
      `UPDATE chat_sessions SET
         title = ?, run_status = ?, active_run_id = ?, interrupt_reason = ?
       WHERE id = ?`,
    )
    .run(title, runStatus, activeRunId, interruptReason, existing.id);
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
  const activeRunId =
    options?.activeRunId !== undefined ? options.activeRunId : session.activeRunId;
  const interruptReason =
    options?.interruptReason !== undefined ? options.interruptReason : session.interruptReason;
  chatDb(session.workspaceId)
    .prepare(
      `UPDATE chat_sessions SET
         run_status = ?, active_run_id = ?, interrupt_reason = ?
       WHERE id = ?`,
    )
    .run(status, activeRunId, interruptReason, session.id);
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

/** 按 active_run_id 查找会话（cancel 落库时不依赖 activeSession）。 */
export function getSessionByActiveRunId(runId: string): ChatSessionRecord | null {
  const id = runId?.trim();
  if (!id) return null;
  for (const ws of listWorkspaces()) {
    const row = chatDb(ws.id)
      .prepare(
        `SELECT id, thread_id, workspace_id, title, pinned, sort_order,
                run_status, active_run_id, interrupt_reason, created_at, updated_at
         FROM chat_sessions WHERE active_run_id = ? LIMIT 1`,
      )
      .get(id) as SessionRow | undefined;
    if (row) return mapSession(row);
  }
  return null;
}

/**
 * 进程退出 / 启动时愈合会话状态：
 * - `queued` 且未要求保留 → `failed`（内存队列已丢，不能 Resume），收束 pending
 * - `running` 且有 checkpoint → `crashed`（可 Resume）
 * - `running` 且无 checkpoint → `failed`，收束 pending 消息
 * - 非 running 且无 checkpoint、却仍有 pending 助手消息 → 收束，避免永远 Planning
 * @param options.preserveQueued utility 闪退时队列仍在内存里，不要把 queued 收掉
 */
export function healRunningSessions(options?: { preserveQueued?: boolean }): number {
  let changes = 0;

  for (const ws of listWorkspaces()) {
    const db = chatDb(ws.id);
    const rows = db
      .prepare(
        `SELECT id, thread_id, run_status, interrupt_reason FROM chat_sessions
         WHERE run_status IN ('running', 'queued', 'cancelled', 'crashed', 'failed')`,
      )
      .all() as Array<{
      id: string;
      thread_id: string;
      run_status: string;
      interrupt_reason: string | null;
    }>;

    for (const row of rows) {
      if (row.run_status === "queued") {
        const plan = planQueuedHeal(options?.preserveQueued === true);
        if (plan.action === "keep") continue;
        db.prepare(
          `UPDATE chat_sessions
           SET run_status = ?,
               active_run_id = NULL,
               interrupt_reason = ?
           WHERE id = ?`,
        ).run(plan.runStatus, plan.interruptReason, row.id);
        finalizeOrphanPendingMessages(ws.id, row.id, plan.message, "failed");
        changes += 1;
        continue;
      }

      const ckpt = peekThreadCheckpoint(row.thread_id);
      if (ckpt) {
        const dirtyReason = /no pending interrupt|tool_approval/i.test(row.interrupt_reason ?? "");
        const alreadyCrashed = row.run_status === "crashed" && !dirtyReason;
        const alreadyCancelled =
          row.run_status === "cancelled" &&
          (row.interrupt_reason ?? "").toLowerCase() === "cancelled" &&
          !dirtyReason;
        // 启动愈合：残留 running → crashed；保留用户 cancelled
        if (row.run_status === "cancelled" && !dirtyReason) {
          db.prepare(
            `UPDATE chat_sessions SET active_run_id = NULL WHERE id = ? AND active_run_id IS NOT NULL`,
          ).run(row.id);
          continue;
        }
        if (!alreadyCrashed && !alreadyCancelled) {
          db.prepare(
            `UPDATE chat_sessions
             SET run_status = 'crashed',
                 active_run_id = NULL,
                 interrupt_reason = ?
             WHERE id = ?`,
          ).run("crash", row.id);
          changes += 1;
        } else if (dirtyReason) {
          db.prepare(
            `UPDATE chat_sessions
             SET run_status = 'crashed',
                 active_run_id = NULL,
                 interrupt_reason = ?
             WHERE id = ?`,
          ).run("crash", row.id);
          changes += 1;
        } else {
          // 已是 crashed/cancelled 但仍残留 active_run_id：一并清掉
          db.prepare(
            `UPDATE chat_sessions SET active_run_id = NULL WHERE id = ? AND active_run_id IS NOT NULL`,
          ).run(row.id);
        }
        continue;
      }

      if (row.run_status === "running") {
        db.prepare(
          `UPDATE chat_sessions
           SET run_status = 'failed',
               active_run_id = NULL,
               interrupt_reason = COALESCE(interrupt_reason, ?)
           WHERE id = ?`,
        ).run("Process exited before the run could be checkpointed.", row.id);
        finalizeOrphanPendingMessages(ws.id, row.id, "Run interrupted by process restart.");
        changes += 1;
        continue;
      }

      // cancelled/crashed/failed 但无 checkpoint：若仍有 pending 气泡则收束
      const pending = db
        .prepare(
          `SELECT COUNT(*) AS c FROM chat_messages
           WHERE session_id = ? AND pending = 1 AND role = 'assistant'`,
        )
        .get(row.id) as { c: number };
      if ((pending?.c ?? 0) > 0) {
        finalizeOrphanPendingMessages(ws.id, row.id, "Run interrupted by process restart.");
        if (row.run_status === "cancelled" || row.run_status === "crashed") {
          db.prepare(
            `UPDATE chat_sessions
             SET run_status = 'failed',
                 active_run_id = NULL,
                 interrupt_reason = COALESCE(interrupt_reason, ?)
             WHERE id = ?`,
          ).run("No checkpoint to resume.", row.id);
        }
        changes += 1;
      }
    }
  }
  // 纠正历史误写的 updated_at（重命名/置顶/跑状态曾误刷新）
  changes += resyncSessionActivityTimes();
  return changes;
}

/**
 * 将各会话 updated_at 与末条消息 created_at 对齐（无消息则用 created_at）。
 * @returns 实际改动的行数。
 */
export function resyncSessionActivityTimes(): number {
  let changes = 0;
  for (const ws of listWorkspaces()) {
    const result = chatDb(ws.id)
      .prepare(
        `UPDATE chat_sessions
         SET updated_at = COALESCE(
           (SELECT MAX(created_at) FROM chat_messages WHERE session_id = chat_sessions.id),
           created_at
         )
         WHERE updated_at IS NOT
           COALESCE(
             (SELECT MAX(created_at) FROM chat_messages WHERE session_id = chat_sessions.id),
             created_at
           )`,
      )
      .run();
    changes += result.changes;
  }
  return changes;
}

/** 将会话中仍 pending 的助手消息标为失败，避免 UI 永久 Planning。 */
/**
 * 把仍 pending 的助手气泡收成终态，并补一条错误。
 * `code` 默认 PROCESS_EXIT（进程重启）。排队失败传 `failed`，这样界面展示原文而不是「异常退出」。
 */
export function finalizeOrphanPendingMessages(
  workspaceId: string,
  sessionId: string,
  errorText: string,
  code = "PROCESS_EXIT",
): void {
  const db = chatDb(workspaceId);
  const rows = db
    .prepare(
      `SELECT id, text, payload_json FROM chat_messages
       WHERE session_id = ? AND pending = 1 AND role = 'assistant'`,
    )
    .all(sessionId) as Array<{ id: string; text: string; payload_json: string | null }>;
  if (rows.length === 0) return;

  const upd = db.prepare(`UPDATE chat_messages SET pending = 0, payload_json = ? WHERE id = ?`);
  const tx = db.transaction(() => {
    for (const row of rows) {
      upd.run(buildOrphanHealPayload(row.payload_json, row.id, errorText, code), row.id);
    }
  });
  tx();
}

export function renameSession(sessionId: string, title: string): ChatSessionRecord {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found.");
  const trimmed = title.trim().slice(0, 120);
  if (!trimmed) throw new Error("Title is empty.");
  chatDb(session.workspaceId)
    .prepare("UPDATE chat_sessions SET title = ? WHERE id = ?")
    .run(trimmed, sessionId);
  return requireSession(session.workspaceId, sessionId);
}

export function setSessionPinned(sessionId: string, pinned: boolean): ChatSessionRecord {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found.");
  chatDb(session.workspaceId)
    .prepare("UPDATE chat_sessions SET pinned = ? WHERE id = ?")
    .run(pinned ? 1 : 0, sessionId);
  return requireSession(session.workspaceId, sessionId);
}

export function reorderSessions(workspaceId: string, input: ReorderInput): void {
  const upd = chatDb(workspaceId).prepare("UPDATE chat_sessions SET sort_order = ? WHERE id = ?");
  const tx = chatDb(workspaceId).transaction((ids: string[]) => {
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      if (id) upd.run(index, id);
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
        .prepare("UPDATE chat_sessions SET sort_order = ? WHERE id = ?")
        .run(input.sortOrder, input.sessionId);
    }
    return requireSession(input.workspaceId, input.sessionId);
  }

  const messages = loadMessages(input.sessionId);
  const sortOrder =
    typeof input.sortOrder === "number" ? input.sortOrder : nextSessionSortOrder(input.workspaceId);

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
      session.updatedAt,
    );
  saveMessagesToDb(input.workspaceId, input.sessionId, messages);
  chatDb(session.workspaceId).prepare("DELETE FROM chat_sessions WHERE id = ?").run(session.id);
  indexSession(session.id, session.threadId, input.workspaceId);
  return requireSession(input.workspaceId, input.sessionId);
}

export function removeSession(sessionId: string): void {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found.");
  const threadId = session.threadId;
  chatDb(session.workspaceId).prepare("DELETE FROM chat_sessions WHERE id = ?").run(sessionId);
  unindexSession(sessionId);
  if (getKv(KV_ACTIVE) === sessionId) setKv(KV_ACTIVE, "");
  clearSessionModelSelection(sessionId);
  clearSessionChatMode(sessionId);
  // checkpoint + Trace（失败忽略，不拖垮删会话）
  purgeSessionArtifacts({ sessionId, threadId });
}
