/**
 * 日志 SQLite：按条数分库，主进程独占写入。
 * 分片文件名：`log-YYYY-MM-DD_HHMMSS.db`（开库本地时间，可读；滚动仍按条数）。
 *
 * 路由规则：
 * - 新 trace（或无 traceId）写入当前「活跃」分片；活跃分片条数 ≥ 阈值后滚动，新 trace 进新库。
 * - 已见过的 traceId 亲和绑定原分片：未完成链路继续进旧库，即使该库已不再接纳新 trace。
 * - 查询跨分片合并；带 traceId 时优先走路由表定位分片。
 */
import fs from "node:fs";
import path from "node:path";
import type { LogRecord } from "@thinker-workbench/logger";
import Database from "better-sqlite3";
import { getLogDir } from "../config/paths";
import {
  LOG_META_SCHEMA_SQL,
  LOG_META_SCHEMA_VERSION,
  LOG_RECORDS_PER_SHARD,
  LOG_SCHEMA_SQL,
  LOG_SCHEMA_VERSION,
} from "../db/schema";

const openShards = new Map<string, Database.Database>();
let insertStmtCache = new Map<string, Database.Statement>();

let metaDb: Database.Database | null = null;
let metaPath: string | null = null;

/** 单分片普通列表扫描上限。 */
const SHARD_SCAN_CAP = 8_000;
/** 单 trace 在一片内的拉取上限。 */
const TRACE_SHARD_CAP = 50_000;

/** 分片键：`log-2026-10-08_203712` 或同秒冲突时的 `…_203712-2`。 */
const SHARD_KEY_RE = /^log-\d{4}-\d{2}-\d{2}_\d{6}(?:-\d+)?$/;
const SHARD_FILE_RE = /^log-\d{4}-\d{2}-\d{2}_\d{6}(?:-\d+)?\.db$/;
const META_FILE = "meta.db";

function shardPath(key: string): string {
  return path.join(getLogDir(), `${key}.db`);
}

function metaDbPath(): string {
  return path.join(getLogDir(), META_FILE);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 以开库本地时间生成可读分片键；同秒冲突则加 `-2`、`-3`… */
function newShardKey(meta: Database.Database): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  const base = `log-${stamp}`;
  let key = base;
  let n = 1;
  const exists = (k: string) =>
    Boolean(meta.prepare("SELECT 1 AS ok FROM shards WHERE key = ?").get(k)) ||
    fs.existsSync(shardPath(k));
  while (exists(key)) {
    n += 1;
    key = `${base}-${n}`;
  }
  return key;
}

function openMeta(): Database.Database {
  const file = metaDbPath();
  if (metaDb && metaPath === file) return metaDb;
  if (metaDb) {
    try {
      metaDb.close();
    } catch {
      /* ignore */
    }
    metaDb = null;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(LOG_META_SCHEMA_SQL);
  db.prepare(
    "INSERT INTO schema_meta(key, value) VALUES('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(String(LOG_META_SCHEMA_VERSION));
  metaDb = db;
  metaPath = file;
  ensureActiveShard(db);
  return db;
}

function ensureActiveShard(meta: Database.Database): string {
  const active = meta
    .prepare(
      "SELECT key FROM shards WHERE accepting_new = 1 ORDER BY created_at DESC, key DESC LIMIT 1",
    )
    .get() as { key: string } | undefined;
  if (active?.key) return active.key;

  const key = newShardKey(meta);
  meta
    .prepare(
      "INSERT INTO shards(key, record_count, created_at, accepting_new) VALUES(?, 0, ?, 1)",
    )
    .run(key, Date.now());
  return key;
}

function rotateActiveShard(meta: Database.Database, fullKey: string): string {
  meta.prepare("UPDATE shards SET accepting_new = 0 WHERE key = ?").run(fullKey);
  const key = newShardKey(meta);
  meta
    .prepare(
      "INSERT INTO shards(key, record_count, created_at, accepting_new) VALUES(?, 0, ?, 1)",
    )
    .run(key, Date.now());
  return key;
}

function openShard(key: string): Database.Database {
  const existing = openShards.get(key);
  if (existing) return existing;
  const file = shardPath(key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(LOG_SCHEMA_SQL);
  db.prepare(
    "INSERT INTO schema_meta(key, value) VALUES('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(String(LOG_SCHEMA_VERSION));
  openShards.set(key, db);
  insertStmtCache.set(
    key,
    db.prepare(
      `INSERT INTO log_records(
         ts, level, source, scope, message, trace_id, span_id, thread_id, run_id, meta_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
  );
  return db;
}

/**
 * 解析本条应写入的分片。
 * - 已有 trace 路由 → 旧库（未完成链路）
 * - 否则 → 活跃库；写后若触顶则滚动（本条仍落在刚写满的库，下一条新 trace 进新库）
 */
function resolveWriteShard(meta: Database.Database, traceId: string | undefined): string {
  const tid = traceId?.trim();
  if (tid) {
    const routed = meta.prepare("SELECT shard_key FROM trace_routes WHERE trace_id = ?").get(tid) as
      | { shard_key: string }
      | undefined;
    if (routed?.shard_key) return routed.shard_key;
  }

  let active = ensureActiveShard(meta);
  const row = meta.prepare("SELECT record_count, accepting_new FROM shards WHERE key = ?").get(
    active,
  ) as { record_count: number; accepting_new: number } | undefined;

  // 活跃库已满：先滚动，新 trace 进新库
  if (row && row.accepting_new === 1 && row.record_count >= LOG_RECORDS_PER_SHARD) {
    active = rotateActiveShard(meta, active);
  }
  return active;
}

/** 写入一条日志（按条数分库 + trace 亲和）。 */
export function insertLogRecord(record: LogRecord): void {
  const ts = typeof record.ts === "number" ? record.ts : Date.now();
  const tid = record.traceId?.trim() || undefined;
  const meta = openMeta();

  const key = resolveWriteShard(meta, tid);
  openShard(key);
  const stmt = insertStmtCache.get(key);
  if (!stmt) return;

  // 数据分片与 meta 是两个连接；先落记录再更新路由（主进程单线程写入）
  stmt.run(
    ts,
    record.level,
    record.source,
    record.scope,
    record.message,
    tid ?? null,
    record.spanId ?? null,
    record.threadId ?? null,
    record.runId ?? null,
    record.meta ? JSON.stringify(record.meta) : null,
  );

  const touch = meta.transaction(() => {
    meta
      .prepare(
        `INSERT INTO shards(key, record_count, created_at, accepting_new)
         VALUES(?, 1, ?, 0)
         ON CONFLICT(key) DO UPDATE SET record_count = record_count + 1`,
      )
      .run(key, Date.now());

    if (tid) {
      meta
        .prepare(
          `INSERT INTO trace_routes(trace_id, shard_key, last_ts) VALUES(?, ?, ?)
           ON CONFLICT(trace_id) DO UPDATE SET last_ts = excluded.last_ts`,
        )
        .run(tid, key, ts);
    }

    // 本条写入后触顶 → 封库，后续新 trace 进新库（未完成 trace 仍绑此 key）
    const after = meta.prepare("SELECT record_count, accepting_new FROM shards WHERE key = ?").get(
      key,
    ) as { record_count: number; accepting_new: number } | undefined;
    if (after && after.accepting_new === 1 && after.record_count >= LOG_RECORDS_PER_SHARD) {
      rotateActiveShard(meta, key);
    }
  });
  touch();
}

/** 列出数据分片（新→旧）；不含 meta.db。 */
export function listLogShards(): Array<{ name: string; size: number; mtimeMs: number }> {
  const dir = getLogDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => SHARD_FILE_RE.test(name))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, mtimeMs: st.mtimeMs };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

type LogRow = {
  id: number;
  ts: number;
  level: string;
  source: string;
  scope: string;
  message: string;
  trace_id: string | null;
  span_id: string | null;
  thread_id: string | null;
  run_id: string | null;
  meta_json: string | null;
};

function rowToRecord(row: LogRow): LogRecord {
  let meta: Record<string, unknown> | undefined;
  if (row.meta_json) {
    try {
      meta = JSON.parse(row.meta_json) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  return {
    ts: row.ts,
    level: row.level as LogRecord["level"],
    source: row.source as LogRecord["source"],
    scope: row.scope,
    message: row.message,
    traceId: row.trace_id ?? undefined,
    spanId: row.span_id ?? undefined,
    threadId: row.thread_id ?? undefined,
    runId: row.run_id ?? undefined,
    meta,
  };
}

export type LogsDbQuery = {
  /** 分片名如 `log-2026-10-08_203712.db`，或 `all`。 */
  file?: string;
  q?: string;
  level?: string;
  source?: string;
  traceId?: string;
  limit: number;
  offset: number;
};

type WhereBuilt = { where: string; params: unknown[] };

function buildWhere(query: LogsDbQuery): WhereBuilt {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (query.level) {
    clauses.push("level = ?");
    params.push(query.level);
  }
  if (query.source) {
    clauses.push("source = ?");
    params.push(query.source);
  }
  if (query.traceId?.trim()) {
    clauses.push("trace_id = ?");
    params.push(query.traceId.trim());
  }
  const q = query.q?.trim().toLowerCase() ?? "";
  if (q) {
    clauses.push(
      "(lower(message) LIKE ? OR lower(scope) LIKE ? OR lower(ifnull(trace_id,'')) LIKE ? OR lower(ifnull(meta_json,'')) LIKE ?)",
    );
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function fetchShardRows(key: string, where: WhereBuilt, cap: number): LogRow[] {
  try {
    const db = openShard(key);
    return db
      .prepare(
        `SELECT id, ts, level, source, scope, message, trace_id, span_id, thread_id, run_id, meta_json
         FROM log_records ${where.where}
         ORDER BY ts DESC, id DESC
         LIMIT ?`,
      )
      .all(...where.params, cap) as LogRow[];
  } catch {
    return [];
  }
}

function lookupTraceShard(traceId: string): string | null {
  try {
    const meta = openMeta();
    const row = meta.prepare("SELECT shard_key FROM trace_routes WHERE trace_id = ?").get(traceId) as
      | { shard_key: string }
      | undefined;
    return row?.shard_key ?? null;
  } catch {
    return null;
  }
}

/** 近期 trace 路由（按 last_ts 新→旧），供 Traces 侧栏，避免只扫最近 N 条日志漏链。 */
export function listRecentTraceRoutes(limit: number): Array<{ traceId: string; lastTs: number }> {
  const capped = Math.min(500, Math.max(1, limit));
  try {
    const meta = openMeta();
    const rows = meta
      .prepare(
        `SELECT trace_id AS traceId, last_ts AS lastTs
         FROM trace_routes
         ORDER BY last_ts DESC
         LIMIT ?`,
      )
      .all(capped) as Array<{ traceId: string; lastTs: number }>;
    return rows.filter((r) => typeof r.traceId === "string" && r.traceId.length > 0);
  } catch {
    return [];
  }
}

/** 跨分片合并查询。 */
export function queryLogRecords(query: LogsDbQuery): {
  records: LogRecord[];
  total: number;
} {
  const shards = listLogShards();
  let wanted =
    query.file && query.file !== "all"
      ? shards.filter((s) => s.name === query.file)
      : shards;

  // 有路由时只扫绑定分片；路由缺失再全扫
  const tid = query.traceId?.trim();
  if (tid && (!query.file || query.file === "all")) {
    const bound = lookupTraceShard(tid);
    if (bound) {
      const hit = shards.filter((s) => s.name === `${bound}.db`);
      if (hit.length) wanted = hit;
    }
  }

  const where = buildWhere(query);
  const isTrace = Boolean(tid);
  const need = query.offset + query.limit;
  const matched: LogRecord[] = [];
  let truncated = false;

  for (const shard of wanted) {
    const key = shard.name.replace(/\.db$/, "");
    const cap = isTrace ? TRACE_SHARD_CAP : SHARD_SCAN_CAP;
    const rows = fetchShardRows(key, where, cap);
    if (rows.length >= cap) truncated = true;
    for (const row of rows) matched.push(rowToRecord(row));

    if (!isTrace && !query.q?.trim() && matched.length >= need + SHARD_SCAN_CAP) {
      break;
    }
  }

  matched.sort((a, b) => b.ts - a.ts);
  const total = truncated ? matched.length + 1 : matched.length;
  const slice = matched.slice(query.offset, query.offset + query.limit);
  slice.reverse();
  return { records: slice, total: Math.max(total, matched.length) };
}

/** 从近期分片收集记录（供 traces）。 */
export function readRecentLogRecords(limit: number): LogRecord[] {
  const { records } = queryLogRecords({
    file: "all",
    limit,
    offset: 0,
  });
  return records;
}

/** 按 traceId 拉齐链路（优先路由表定位分片）。 */
export function queryTraceRecords(traceId: string): LogRecord[] {
  const id = traceId.trim();
  if (!id) return [];
  const { records } = queryLogRecords({
    file: "all",
    traceId: id,
    limit: TRACE_SHARD_CAP,
    offset: 0,
  });
  return records;
}

function unlinkShardFiles(key: string): void {
  try {
    fs.unlinkSync(shardPath(key));
  } catch {
    /* ignore */
  }
  for (const suffix of ["-wal", "-shm"]) {
    const side = `${shardPath(key)}${suffix}`;
    try {
      if (fs.existsSync(side)) fs.unlinkSync(side);
    } catch {
      /* ignore */
    }
  }
}

/** 按保留天数清理：删掉过旧分片文件，并清理路由。 */
export function pruneLogShards(retentionDays: number): {
  removedShards: string[];
  removedRows: number;
} {
  const result = { removedShards: [] as string[], removedRows: 0 };
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return result;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  let meta: Database.Database | null = null;
  try {
    meta = openMeta();
  } catch {
    meta = null;
  }

  for (const shard of listLogShards()) {
    const key = shard.name.replace(/\.db$/, "");
    // 按文件 mtime；计数分片也可用片内最旧 ts，这里用 mtime 足够
    if (shard.mtimeMs >= cutoff) {
      // 边界片：删掉过期行
      if (SHARD_KEY_RE.test(key)) {
        try {
          const db = openShard(key);
          const r = db.prepare("DELETE FROM log_records WHERE ts < ?").run(cutoff);
          result.removedRows += r.changes;
          const left = db.prepare("SELECT COUNT(*) AS c FROM log_records").get() as { c: number };
          if (meta) {
            meta.prepare("UPDATE shards SET record_count = ? WHERE key = ?").run(left.c, key);
          }
        } catch {
          /* ignore */
        }
      }
      continue;
    }

    // 整片过期
    const db = openShards.get(key);
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      openShards.delete(key);
      insertStmtCache.delete(key);
    }
    unlinkShardFiles(key);
    result.removedShards.push(shard.name);
    if (meta && SHARD_KEY_RE.test(key)) {
      try {
        meta.prepare("DELETE FROM shards WHERE key = ?").run(key);
        meta.prepare("DELETE FROM trace_routes WHERE shard_key = ?").run(key);
      } catch {
        /* ignore */
      }
    }
  }

  // 清掉指向已不存在分片的路由；过期 idle 路由（按 last_ts）
  if (meta) {
    try {
      meta.prepare("DELETE FROM trace_routes WHERE last_ts < ?").run(cutoff);
      const keys = new Set(
        (meta.prepare("SELECT key FROM shards").all() as Array<{ key: string }>).map((r) => r.key),
      );
      for (const file of listLogShards()) {
        const k = file.name.replace(/\.db$/, "");
        if (SHARD_KEY_RE.test(k)) keys.add(k);
      }
      const routes = meta.prepare("SELECT trace_id, shard_key FROM trace_routes").all() as Array<{
        trace_id: string;
        shard_key: string;
      }>;
      const del = meta.prepare("DELETE FROM trace_routes WHERE trace_id = ?");
      for (const r of routes) {
        if (!keys.has(r.shard_key) || !fs.existsSync(shardPath(r.shard_key))) {
          del.run(r.trace_id);
        }
      }
      ensureActiveShard(meta);
    } catch {
      /* ignore */
    }
  }

  return result;
}

/** 关闭全部分片与元库（退出前）。 */
export function closeLogsDb(): void {
  for (const db of openShards.values()) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  openShards.clear();
  insertStmtCache = new Map();
  if (metaDb) {
    try {
      metaDb.close();
    } catch {
      /* ignore */
    }
    metaDb = null;
    metaPath = null;
  }
}
