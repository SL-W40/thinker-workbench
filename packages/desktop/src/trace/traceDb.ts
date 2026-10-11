/**
 * 会话 Trace SQLite 索引（trace.db）。
 */
import fs from "node:fs";
import path from "node:path";
import type {
  TraceListSessionsQuery,
  TraceSessionSummary,
  TraceSpanRecord,
  TraceSpanKind,
  TraceSource,
  TraceSpanStatus,
} from "@thinker-workbench/shared";
import Database from "better-sqlite3";
import { getTraceDir } from "../config/paths";
import { TRACE_SCHEMA_SQL, TRACE_SCHEMA_VERSION } from "../db/schema";
import { ensureTraceDirs } from "./sessionJsonl";

let db: Database.Database | null = null;

function dbPath(): string {
  return path.join(getTraceDir(), "trace.db");
}

export function openTraceDb(): Database.Database {
  if (db) return db;
  ensureTraceDirs();
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(TRACE_SCHEMA_SQL);
  const row = db
    .prepare("SELECT value FROM schema_meta WHERE key = ?")
    .get("version") as { value: string } | undefined;
  if (!row) {
    db.prepare("INSERT INTO schema_meta(key, value) VALUES (?, ?)").run(
      "version",
      String(TRACE_SCHEMA_VERSION),
    );
  }
  return db;
}

export function closeTraceDb(): void {
  if (!db) return;
  try {
    db.close();
  } catch {
    /* ignore */
  }
  db = null;
}

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

function rowToSpan(r: SpanRow): TraceSpanRecord {
  let attrs: Record<string, unknown> | undefined;
  if (r.attrs_json) {
    try {
      attrs = JSON.parse(r.attrs_json) as Record<string, unknown>;
    } catch {
      attrs = undefined;
    }
  }
  return {
    spanId: r.span_id,
    sessionId: r.session_id,
    runId: r.run_id ?? undefined,
    traceId: r.trace_id ?? undefined,
    parentSpanId: r.parent_span_id ?? undefined,
    taskId: r.task_id ?? undefined,
    name: r.name,
    kind: r.kind as TraceSpanKind,
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

export function upsertSession(meta: {
  sessionId: string;
  workspaceId?: string;
  threadId?: string;
  title?: string;
  ts: number;
  bumpRun?: boolean;
}): void {
  const d = openTraceDb();
  const existing = d
    .prepare("SELECT session_id, first_ts, run_count FROM sessions WHERE session_id = ?")
    .get(meta.sessionId) as
    | { session_id: string; first_ts: number; run_count: number }
    | undefined;
  if (!existing) {
    d.prepare(
      `INSERT INTO sessions(session_id, workspace_id, thread_id, title, first_ts, last_ts, run_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      meta.sessionId,
      meta.workspaceId ?? null,
      meta.threadId ?? null,
      meta.title ?? null,
      meta.ts,
      meta.ts,
      meta.bumpRun ? 1 : 0,
    );
    return;
  }
  d.prepare(
    `UPDATE sessions SET
       workspace_id = COALESCE(?, workspace_id),
       thread_id = COALESCE(?, thread_id),
       title = COALESCE(?, title),
       last_ts = MAX(last_ts, ?),
       run_count = run_count + ?
     WHERE session_id = ?`,
  ).run(
    meta.workspaceId ?? null,
    meta.threadId ?? null,
    meta.title ?? null,
    meta.ts,
    meta.bumpRun ? 1 : 0,
    meta.sessionId,
  );
}

export function insertSpanStart(span: TraceSpanRecord): void {
  const d = openTraceDb();
  upsertSession({
    sessionId: span.sessionId,
    workspaceId: typeof span.attrs?.workspaceId === "string" ? span.attrs.workspaceId : undefined,
    threadId: typeof span.attrs?.threadId === "string" ? span.attrs.threadId : undefined,
    ts: span.startTs,
  });
  d.prepare(
    `INSERT OR REPLACE INTO spans(
      span_id, session_id, run_id, trace_id, parent_span_id, task_id,
      name, kind, source, status, start_ts, end_ts, summary, input_ref, output_ref, attrs_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    span.spanId,
    span.sessionId,
    span.runId ?? null,
    span.traceId ?? null,
    span.parentSpanId ?? null,
    span.taskId ?? null,
    span.name,
    span.kind,
    span.source,
    span.status ?? "running",
    span.startTs,
    span.endTs ?? null,
    span.summary ?? null,
    span.inputRef ?? null,
    span.outputRef ?? null,
    span.attrs ? JSON.stringify(span.attrs) : null,
  );
}

export function getSpan(spanId: string): TraceSpanRecord | null {
  const row = openTraceDb().prepare("SELECT * FROM spans WHERE span_id = ?").get(spanId) as
    | SpanRow
    | undefined;
  return row ? rowToSpan(row) : null;
}

export function updateSpanEnd(
  spanId: string,
  patch: {
    status?: TraceSpanStatus;
    summary?: string;
    endTs?: number;
    outputRef?: string;
    attrs?: Record<string, unknown>;
  },
): TraceSpanRecord | null {
  const d = openTraceDb();
  const prev = d.prepare("SELECT * FROM spans WHERE span_id = ?").get(spanId) as
    | SpanRow
    | undefined;
  if (!prev) return null;
  let attrs = prev.attrs_json;
  if (patch.attrs) {
    let base: Record<string, unknown> = {};
    try {
      base = prev.attrs_json ? (JSON.parse(prev.attrs_json) as Record<string, unknown>) : {};
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
  ).run(
    patch.status ?? null,
    patch.summary ?? null,
    endTs,
    patch.outputRef ?? null,
    attrs,
    spanId,
  );
  upsertSession({ sessionId: prev.session_id, ts: endTs });
  const next = d.prepare("SELECT * FROM spans WHERE span_id = ?").get(spanId) as SpanRow;
  return rowToSpan(next);
}

export function setSpanInputRef(spanId: string, inputRef: string): void {
  openTraceDb()
    .prepare("UPDATE spans SET input_ref = ? WHERE span_id = ?")
    .run(inputRef, spanId);
}

export function listSessions(query: TraceListSessionsQuery = {}): TraceSessionSummary[] {
  const d = openTraceDb();
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
  const rows = d
    .prepare(
      `SELECT session_id, workspace_id, thread_id, title, first_ts, last_ts, run_count
       FROM sessions ${where}
       ORDER BY last_ts DESC
       LIMIT ?`,
    )
    .all(...params, limit) as Array<{
    session_id: string;
    workspace_id: string | null;
    thread_id: string | null;
    title: string | null;
    first_ts: number;
    last_ts: number;
    run_count: number;
  }>;
  return rows.map((r) => ({
    sessionId: r.session_id,
    workspaceId: r.workspace_id ?? undefined,
    threadId: r.thread_id ?? undefined,
    title: r.title ?? undefined,
    firstTs: r.first_ts,
    lastTs: r.last_ts,
    runCount: r.run_count,
  }));
}

export function listSessionSpans(sessionId: string): TraceSpanRecord[] {
  const rows = openTraceDb()
    .prepare("SELECT * FROM spans WHERE session_id = ? ORDER BY start_ts ASC")
    .all(sessionId) as SpanRow[];
  return rows.map(rowToSpan);
}

export function listSessionsOldestFirst(): TraceSessionSummary[] {
  const rows = openTraceDb()
    .prepare(
      `SELECT session_id, workspace_id, thread_id, title, first_ts, last_ts, run_count
       FROM sessions ORDER BY last_ts ASC`,
    )
    .all() as Array<{
    session_id: string;
    workspace_id: string | null;
    thread_id: string | null;
    title: string | null;
    first_ts: number;
    last_ts: number;
    run_count: number;
  }>;
  return rows.map((r) => ({
    sessionId: r.session_id,
    workspaceId: r.workspace_id ?? undefined,
    threadId: r.thread_id ?? undefined,
    title: r.title ?? undefined,
    firstTs: r.first_ts,
    lastTs: r.last_ts,
    runCount: r.run_count,
  }));
}

export function deleteSession(sessionId: string): void {
  const d = openTraceDb();
  d.prepare("DELETE FROM spans WHERE session_id = ?").run(sessionId);
  d.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId);
}

export function sessionCount(): number {
  const row = openTraceDb().prepare("SELECT COUNT(*) AS c FROM sessions").get() as {
    c: number;
  };
  return row.c;
}
