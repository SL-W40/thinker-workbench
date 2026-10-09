/**
 * 日志查看器 `/api/meta` `/api/logs` `/api/traces`：读取 SQLite 按条数分片。
 * 供 `packages/logger/web` Vite 开发服务复用。
 * 目录解析与桌面设置一致：读 `~/.thinker/settings.json` 的 general.dataDir
 *（默认 `~/.thinker`），日志固定在 `<dataDir>/logs`
 *（`log-YYYY-MM-DD_HHMMSS.db`；忽略 `meta.db`）。
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";
import type { LogRecord } from "../../../src/types";

const require = createRequire(import.meta.url);

type SqliteDatabase = {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};

type SqliteCtor = new (
  path: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => SqliteDatabase;

function loadSqlite(): SqliteCtor | null {
  try {
    return require("better-sqlite3") as SqliteCtor;
  } catch {
    return null;
  }
}

const BOOTSTRAP = path.join(os.homedir(), ".thinker");
const DEFAULT_DATA = BOOTSTRAP;
/** 单次查询最多扫描的记录数（分页在此窗口内切片）。 */
const SCAN_CAP = 20_000;
const DEFAULT_PAGE = 100;
const MAX_PAGE = 500;
const MIN_PAGE = 20;

/** 与桌面 logsDb 一致的数据分片名；不含 meta.db。 */
const SHARD_FILE_RE = /^log-\d{4}-\d{2}-\d{2}_\d{6}(?:-\d+)?\.db$/;

function expandUserPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.resolve(trimmed);
}

function resolveDataDir(): string {
  try {
    const file = path.join(BOOTSTRAP, "settings.json");
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
        general?: { dataDir?: unknown };
      };
      const dataConfigured =
        typeof parsed.general?.dataDir === "string" ? expandUserPath(parsed.general.dataDir) : "";
      if (dataConfigured) return dataConfigured;
    }
  } catch {
    /* 回落默认 */
  }
  return DEFAULT_DATA;
}

/** 每次请求时重读设置，便于设置页改路径后立刻生效。 */
function resolveLogDir(): string {
  return path.join(resolveDataDir(), "logs");
}

type TraceSummary = {
  traceId: string;
  firstTs: number;
  lastTs: number;
  count: number;
  sources: string[];
  hops: string[];
};

type LogRow = {
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

function sendJson(res: Connect.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function listLogShards(logDir: string): Array<{ name: string; size: number; mtimeMs: number }> {
  if (!fs.existsSync(logDir)) return [];
  return fs
    .readdirSync(logDir)
    .filter((name) => SHARD_FILE_RE.test(name))
    .map((name) => {
      const st = fs.statSync(path.join(logDir, name));
      return { name, size: st.size, mtimeMs: st.mtimeMs };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

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

function readShardRecords(
  Database: SqliteCtor,
  logDir: string,
  fileName: string,
  limit: number,
): LogRecord[] {
  if (!SHARD_FILE_RE.test(fileName)) return [];
  const full = path.join(logDir, fileName);
  const resolvedRoot = path.resolve(logDir);
  if (!full.startsWith(resolvedRoot) || !fs.existsSync(full)) return [];
  try {
    const db = new Database(full, { readonly: true, fileMustExist: true });
    try {
      const rows = db
        .prepare(
          `SELECT ts, level, source, scope, message, trace_id, span_id, thread_id, run_id, meta_json
           FROM log_records
           ORDER BY ts DESC, id DESC
           LIMIT ?`,
        )
        .all(limit) as LogRow[];
      return rows.map(rowToRecord).reverse();
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

function readMergedRecords(
  Database: SqliteCtor,
  logDir: string,
  perFile: number,
  limit: number,
): LogRecord[] {
  const all: LogRecord[] = [];
  for (const shard of listLogShards(logDir)) {
    all.push(...readShardRecords(Database, logDir, shard.name, perFile));
  }
  all.sort((a, b) => a.ts - b.ts || a.scope.localeCompare(b.scope));
  if (all.length > limit) return all.slice(all.length - limit);
  return all;
}

function matchesQuery(rec: LogRecord, q: string): boolean {
  if (!q) return true;
  const hay = [
    rec.message,
    rec.scope,
    rec.source,
    rec.level,
    rec.traceId,
    rec.runId,
    rec.threadId,
    rec.spanId,
    rec.meta ? JSON.stringify(rec.meta) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function collectTraces(records: LogRecord[], limit: number): TraceSummary[] {
  const map = new Map<string, TraceSummary>();
  for (const r of records) {
    const id = r.traceId?.trim();
    if (!id) continue;
    let row = map.get(id);
    if (!row) {
      row = {
        traceId: id,
        firstTs: r.ts,
        lastTs: r.ts,
        count: 0,
        sources: [],
        hops: [],
      };
      map.set(id, row);
    }
    row.count += 1;
    row.firstTs = Math.min(row.firstTs, r.ts);
    row.lastTs = Math.max(row.lastTs, r.ts);
    if (!row.sources.includes(r.source)) row.sources.push(r.source);
    const hop = `${r.source}:${r.scope}`;
    if (row.hops.length < 24 && (row.hops.length === 0 || row.hops[row.hops.length - 1] !== hop)) {
      row.hops.push(hop);
    }
  }
  return [...map.values()].sort((a, b) => b.lastTs - a.lastTs).slice(0, limit);
}

function logsApiMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/api/meta") {
      const logDir = resolveLogDir();
      sendJson(res, 200, { logDir, files: listLogShards(logDir) });
      return;
    }

    if (pathname === "/api/traces" || pathname === "/api/logs") {
      const Database = loadSqlite();
      if (!Database) {
        sendJson(res, 500, { error: "better-sqlite3 is required to read log shards" });
        return;
      }
      const logDir = resolveLogDir();

      if (pathname === "/api/traces") {
        const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit")) || 60));
        const records = readMergedRecords(Database, logDir, 2500, 8000);
        sendJson(res, 200, { logDir, traces: collectTraces(records, limit) });
        return;
      }

      const file = url.searchParams.get("file") || "all";
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const level = (url.searchParams.get("level") || "").trim().toLowerCase();
      const source = (url.searchParams.get("source") || "").trim().toLowerCase();
      const traceId = (url.searchParams.get("traceId") || "").trim();
      const limit = Math.min(
        MAX_PAGE,
        Math.max(MIN_PAGE, Number(url.searchParams.get("limit")) || DEFAULT_PAGE),
      );
      let offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

      const useAll = file === "all" || file === "__all__" || Boolean(traceId);
      if (!useAll && !SHARD_FILE_RE.test(file)) {
        sendJson(res, 400, { error: "Unknown log shard" });
        return;
      }

      let records = useAll
        ? readMergedRecords(Database, logDir, SCAN_CAP, SCAN_CAP)
        : readShardRecords(Database, logDir, file, SCAN_CAP);
      if (level) records = records.filter((r) => r.level === level);
      if (source) records = records.filter((r) => r.source === source);
      if (traceId) {
        const needle = traceId.toLowerCase();
        records = records.filter(
          (r) => r.traceId === traceId || (r.traceId?.toLowerCase().includes(needle) ?? false),
        );
      }
      if (q) records = records.filter((r) => matchesQuery(r, q));

      const total = records.length;
      if (total === 0) offset = 0;
      else if (offset >= total) offset = Math.max(0, total - limit);

      const end = Math.max(0, total - offset);
      const start = Math.max(0, end - limit);
      const page = records.slice(start, end);
      const hasMore = start > 0;

      sendJson(res, 200, {
        logDir,
        file: useAll ? "all" : file,
        count: page.length,
        total,
        offset,
        limit,
        hasMore,
        records: page,
        chain: traceId ? (collectTraces(records, 1)[0] ?? null) : null,
      });
      return;
    }

    next();
  };
}

/** 挂载 `/api/meta` / `/api/logs` / `/api/traces`。 */
export function logsApiPlugin(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use(logsApiMiddleware());
  };
  return {
    name: "thinker-logs-api",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
