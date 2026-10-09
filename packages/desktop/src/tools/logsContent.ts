/**
 * 主进程日志读取：SQLite 按条数分片查询与 trace 摘要。
 */
import type { LogRecord } from "@thinker-workbench/logger";
import type { LogFileInfo, LogsQuery, LogsResponse, TraceSummary } from "@thinker-workbench/shared";
import { getLogDir } from "../config/paths";
import {
  listLogShards,
  queryLogRecords,
  queryTraceRecords,
  readRecentLogRecords,
} from "../log/logsDb";

const DEFAULT_PAGE = 100;
const MAX_PAGE = 500;
const MIN_PAGE = 20;

/** 列出日志分片文件（`log-YYYY-MM-DD_HHMMSS.db`）。 */
export function listLogFiles(): LogFileInfo[] {
  return listLogShards();
}

/** 从记录集合提取近期 trace 摘要。 */
export function collectTraces(records: LogRecord[], limit: number): TraceSummary[] {
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

/** 日志目录元数据。 */
export function logsMeta(): { logDir: string; files: LogFileInfo[] } {
  return { logDir: getLogDir(), files: listLogFiles() };
}

/** 近期 trace 列表。 */
export function logsTraces(limit = 60): TraceSummary[] {
  const capped = Math.min(200, Math.max(10, limit));
  const records = readRecentLogRecords(8000);
  return collectTraces(records, capped);
}

/** 按条件查询日志（最新侧分页；跨分片合并）。 */
export function logsQuery(query: LogsQuery): LogsResponse {
  const file = query.file || "all";
  const limit = Math.min(MAX_PAGE, Math.max(MIN_PAGE, query.limit ?? DEFAULT_PAGE));
  const offset = Math.max(0, query.offset ?? 0);
  const traceId = query.traceId?.trim() ?? "";

  // 点开链路：跨全部分片拉齐后再切片，避免只落在某一页的半截
  if (traceId && (file === "all" || file === "__all__")) {
    const all = queryTraceRecords(traceId);
    const total = all.length;
    const start = Math.max(0, total - offset - limit);
    const end = Math.max(0, total - offset);
    const page = all.slice(start, end);
    const chain = collectTraces(all, 1)[0] ?? null;
    return {
      logDir: getLogDir(),
      file: "all",
      count: page.length,
      total,
      offset,
      limit,
      hasMore: start > 0,
      records: page,
      chain,
    };
  }

  const { records, total } = queryLogRecords({
    file,
    q: query.q,
    level: query.level,
    source: query.source,
    traceId: traceId || undefined,
    limit,
    offset,
  });

  let chain: TraceSummary | null = null;
  if (traceId) {
    const traces = collectTraces(records, 1);
    chain = traces[0] ?? null;
  }

  return {
    logDir: getLogDir(),
    file,
    count: records.length,
    total,
    offset,
    limit,
    hasMore: offset + records.length < total,
    records,
    chain,
  };
}
