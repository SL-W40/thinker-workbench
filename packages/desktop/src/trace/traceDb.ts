/**
 * 会话 Trace SQLite 索引（按工作区各自一份 trace.db）。
 *
 * 所有函数都要求 workspaceId：Trace 与工作区同生命周期，删工作区整目录带走。
 * 不传 workspaceId 的列表查询走跨工作区聚合（见 listSessionsAcrossWorkspaces）。
 */
import type {
  TraceListSessionsQuery,
  TraceRunType,
  TraceSessionSummary,
  TraceSource,
  TraceSpanRecord,
  TraceSpanStatus,
} from "@thinker-workbench/shared";
import { isRecord } from "@thinker-workbench/shared";
import type { Database } from "better-sqlite3";
import { listWorkspaceIds, traceDbFor } from "./workspaceTraceDb";

type SpanRow = {
  span_id: string;
  session_id: string;
  run_id: string | null;
  trace_id: string | null;
  parent_span_id: string | null;
  task_id: string | null;
  name: string;
  kind: string;
  source: string;
  status: string | null;
  start_ts: number;
  end_ts: number | null;
  summary: string | null;
  input_ref: string | null;
  output_ref: string | null;
  attrs_json: string | null;
};

type SessionRow = {
  session_id: string;
  workspace_id: string | null;
  thread_id: string | null;
  title: string | null;
  first_ts: number;
  last_ts: number;
  run_count: number;
};

function rowToSpan(r: SpanRow): TraceSpanRecord {
  let attrs: Record<string, unknown> | undefined;
  if (r.attrs_json) {
    try {
      attrs = JSON.parse(r.attrs_json) as Record<string, unknown>;
      if (!isRecord(attrs)) attrs = undefined;
    } catch {
      attrs = undefined;
    }
  }
  return {
    id: r.span_id,
    sessionId: r.session_id,
    agentRunId: r.run_id ?? undefined,
    traceId: r.trace_id ?? undefined,
    parentId: r.parent_span_id ?? undefined,
    taskId: r.task_id ?? undefined,
    name: r.name,
    runType: r.kind as TraceRunType,
    source: r.source as TraceSource,
    status: (r.status as TraceSpanStatus | null) ?? undefined,
    startTs: r.start_ts,
    endTs: r.end_ts ?? undefined,
    summary: r.summary ?? undefined,
    inputRef: r.input_ref ?? undefined,
    outputRef: r.output_ref ?? undefined,
    attrs,
  };
}

function rowToSession(r: SessionRow, workspaceId: string): TraceSessionSummary {
  return {
    sessionId: r.session_id,
    workspaceId: r.workspace_id ?? workspaceId,
    threadId: r.thread_id ?? undefined,
    title: r.title ?? undefined,
    firstTs: r.first_ts,
    lastTs: r.last_ts,
    runCount: r.run_count,
  };
}

const SESSION_COLUMNS = `session_id, workspace_id, thread_id, title, first_ts, last_ts, run_count`;

function querySessions(
  db: Database,
  query: TraceListSessionsQuery,
  workspaceId: string,
): TraceSessionSummary[] {
  const limit = Math.min(500, Math.max(1, query.limit ?? 100));
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (query.workspaceId) {
    clauses.push("workspace_id = ?");
    params.push(query.workspaceId);
  }
  if (query.q?.trim()) {
    clauses.push("(title LIKE ? OR session_id LIKE ? OR thread_id LIKE ?)");
    const like = `%${query.q.trim()}%`;
    params.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT ${SESSION_COLUMNS}
       FROM sessions ${where}
       ORDER BY last_ts DESC
       LIMIT ?`,
    )
    .all(...params, limit) as SessionRow[];
  return rows.map((r) => rowToSession(r, workspaceId));
}

/** 单工作区内查询会话（按 last_ts 倒序）。 */
export function listWorkspaceSessions(
  workspaceId: string,
  query: TraceListSessionsQuery = {},
): TraceSessionSummary[] {
  return querySessions(traceDbFor(workspaceId), query, workspaceId);
}

/** 跨工作区聚合查询（调用方未指定 workspaceId 时）。 */
export function listSessionsAcrossWorkspaces(
  query: TraceListSessionsQuery = {},
): TraceSessionSummary[] {
  const limit = Math.min(500, Math.max(1, query.limit ?? 100));
  const merged: TraceSessionSummary[] = [];
  for (const id of listWorkspaceIds()) {
    try {
      merged.push(...listWorkspaceSessions(id, { ...query, limit: 500 }));
    } catch {
      /* 单个工作区库损坏不拖垮整体 */
    }
  }
  return merged.sort((a, b) => b.lastTs - a.lastTs).slice(0, limit);
}

/** 列表查询入口：指定工作区走单库，否则跨工作区聚合。 */
export function listSessions(query: TraceListSessionsQuery = {}): TraceSessionSummary[] {
  const workspaceId = query.workspaceId?.trim();
  if (workspaceId) return listWorkspaceSessions(workspaceId, query);
  return listSessionsAcrossWorkspaces(query);
}

export function upsertSession(
  workspaceId: string,
  meta: { sessionId: string; threadId?: string; title?: string; ts: number },
): void {
  const d = traceDbFor(workspaceId);
  // run_count 由 spans 表派生：一次运行 = 一个不同的 agentRunId（与渲染端分组口径一致）。
  const existing = d
    .prepare("SELECT session_id FROM sessions WHERE session_id = ?")
    .get(meta.sessionId) as { session_id: string } | undefined;
  if (!existing) {
    d.prepare(
      `INSERT INTO sessions(session_id, workspace_id, thread_id, title, first_ts, last_ts, run_count)
       VALUES (?, ?, ?, ?, ?, ?, (SELECT COUNT(DISTINCT COALESCE(run_id, '')) FROM spans WHERE session_id = ?))`,
    ).run(
      meta.sessionId,
      workspaceId,
      meta.threadId ?? null,
      meta.title ?? null,
      meta.ts,
      meta.ts,
      meta.sessionId,
    );
    return;
  }
  d.prepare(
    `UPDATE sessions SET
       workspace_id = COALESCE(workspace_id, ?),
       thread_id = COALESCE(?, thread_id),
       title = COALESCE(?, title),
       last_ts = MAX(last_ts, ?),
       run_count = (SELECT COUNT(DISTINCT COALESCE(run_id, '')) FROM spans WHERE session_id = ?)
     WHERE session_id = ?`,
  ).run(
    workspaceId,
    meta.threadId ?? null,
    meta.title ?? null,
    meta.ts,
    meta.sessionId,
    meta.sessionId,
  );
}

export function insertSpanStart(workspaceId: string, span: TraceSpanRecord): void {
  const d = traceDbFor(workspaceId);
  d.prepare(
    `INSERT OR REPLACE INTO spans(
      span_id, session_id, run_id, trace_id, parent_span_id, task_id,
      name, kind, source, status, start_ts, end_ts, summary, input_ref, output_ref, attrs_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    span.id,
    span.sessionId,
    span.agentRunId ?? null,
    span.traceId ?? null,
    span.parentId ?? null,
    span.taskId ?? null,
    span.name,
    span.runType,
    span.source,
    span.status ?? "running",
    span.startTs,
    span.endTs ?? null,
    span.summary ?? null,
    span.inputRef ?? null,
    span.outputRef ?? null,
    span.attrs ? JSON.stringify(span.attrs) : null,
  );
  // span 落库后再刷会话：run_count 派生自此表，顺序反了会漏算本次运行
  upsertSession(workspaceId, {
    sessionId: span.sessionId,
    threadId: typeof span.attrs?.threadId === "string" ? span.attrs.threadId : undefined,
    ts: span.startTs,
  });
}

export function getSpan(workspaceId: string, spanId: string): TraceSpanRecord | null {
  const row = traceDbFor(workspaceId)
    .prepare("SELECT * FROM spans WHERE span_id = ?")
    .get(spanId) as SpanRow | undefined;
  return row ? rowToSpan(row) : null;
}

export function updateSpanEnd(
  workspaceId: string,
  spanId: string,
  patch: {
    status?: TraceSpanStatus;
    summary?: string;
    endTs?: number;
    outputRef?: string;
    attrs?: Record<string, unknown>;
  },
): TraceSpanRecord | null {
  const d = traceDbFor(workspaceId);
  const prev = d.prepare("SELECT * FROM spans WHERE span_id = ?").get(spanId) as
    | SpanRow
    | undefined;
  if (!prev) return null;
  let attrs = prev.attrs_json;
  if (patch.attrs) {
    let base: Record<string, unknown> = {};
    try {
      base = prev.attrs_json ? (JSON.parse(prev.attrs_json) as Record<string, unknown>) : {};
      if (!isRecord(base)) base = {};
    } catch {
      base = {};
    }
    attrs = JSON.stringify({ ...base, ...patch.attrs });
  }
  const endTs = patch.endTs ?? Date.now();
  d.prepare(
    `UPDATE spans SET
      status = COALESCE(?, status),
      summary = COALESCE(?, summary),
      end_ts = ?,
      output_ref = COALESCE(?, output_ref),
      attrs_json = COALESCE(?, attrs_json)
     WHERE span_id = ?`,
  ).run(patch.status ?? null, patch.summary ?? null, endTs, patch.outputRef ?? null, attrs, spanId);
  upsertSession(workspaceId, { sessionId: prev.session_id, ts: endTs });
  const next = d.prepare("SELECT * FROM spans WHERE span_id = ?").get(spanId) as SpanRow;
  return rowToSpan(next);
}

export function setSpanInputRef(workspaceId: string, spanId: string, inputRef: string): void {
  traceDbFor(workspaceId)
    .prepare("UPDATE spans SET input_ref = ? WHERE span_id = ?")
    .run(inputRef, spanId);
}

export function listSessionSpans(workspaceId: string, sessionId: string): TraceSpanRecord[] {
  const rows = traceDbFor(workspaceId)
    .prepare("SELECT * FROM spans WHERE session_id = ? ORDER BY start_ts ASC")
    .all(sessionId) as SpanRow[];
  return rows.map(rowToSpan);
}

/** 按最后活跃时间升序（保留策略删最旧的用）。 */
export function listSessionsOldestFirst(workspaceId: string): TraceSessionSummary[] {
  const rows = traceDbFor(workspaceId)
    .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions ORDER BY last_ts ASC`)
    .all() as SessionRow[];
  return rows.map((r) => rowToSession(r, workspaceId));
}

/**
 * 由 traceId 反查该轮的 agent runId（文件检查点按 runId 归档）。
 * 取该 trace 下任一 span 的 run_id；无则 null（老数据 / trace 已清）。
 */
export function findRunIdByTraceId(workspaceId: string, traceId: string): string | null {
  const id = traceId.trim();
  if (!id) return null;
  try {
    const row = traceDbFor(workspaceId)
      .prepare("SELECT run_id FROM spans WHERE trace_id = ? AND run_id IS NOT NULL LIMIT 1")
      .get(id) as { run_id: string } | undefined;
    return row?.run_id ?? null;
  } catch {
    return null;
  }
}

export function notePayloadIndex(
  workspaceId: string,
  sessionId: string,
  payloadId: string,
  offset: number,
  length: number,
): void {
  traceDbFor(workspaceId)
    .prepare(
      `INSERT OR REPLACE INTO payloads(session_id, payload_id, offset, length)
       VALUES (?, ?, ?, ?)`,
    )
    .run(sessionId, payloadId, offset, length);
}

export function findPayloadIndex(
  workspaceId: string,
  sessionId: string,
  payloadId: string,
): { offset: number; length: number } | null {
  const row = traceDbFor(workspaceId)
    .prepare("SELECT offset, length FROM payloads WHERE session_id = ? AND payload_id = ?")
    .get(sessionId, payloadId) as { offset: number; length: number } | undefined;
  return row ?? null;
}

export function deletePayloadIndex(workspaceId: string, sessionId: string): void {
  traceDbFor(workspaceId).prepare("DELETE FROM payloads WHERE session_id = ?").run(sessionId);
}

export function deleteSession(workspaceId: string, sessionId: string): void {
  const d = traceDbFor(workspaceId);
  d.prepare("DELETE FROM payloads WHERE session_id = ?").run(sessionId);
  d.prepare("DELETE FROM spans WHERE session_id = ?").run(sessionId);
  d.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId);
}

export function sessionCount(workspaceId: string): number {
  const row = traceDbFor(workspaceId).prepare("SELECT COUNT(*) AS c FROM sessions").get() as {
    c: number;
  };
  return row.c;
}
