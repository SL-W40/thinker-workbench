/**
 * 产品工具窗（Logs）经 preload 暴露的数据面。
 * 主进程读 `<dataDir>/logs` 下的 SQLite 按条数分片（`log-YYYY-MM-DD_HHMMSS.db` + `meta.db` 路由）。
 */
import type { LogRecord } from "./log";

/** 日志文件列表项。 */
export type LogFileInfo = {
  name: string;
  size: number;
  mtimeMs: number;
};

/** 按 traceId 汇总的链路摘要。 */
export type TraceSummary = {
  traceId: string;
  firstTs: number;
  lastTs: number;
  count: number;
  sources: string[];
  hops: string[];
};

/** 日志查询参数。 */
export type LogsQuery = {
  file: string;
  q?: string;
  level?: string;
  source?: string;
  traceId?: string;
  /** 每页条数（从最新侧起算）。 */
  limit?: number;
  /** 相对最新侧跳过的条数；0 表示最新一页。 */
  offset?: number;
};

/** 日志查询结果。 */
export type LogsResponse = {
  logDir: string;
  file: string;
  /** 当前页返回条数。 */
  count: number;
  /** 扫描窗口内匹配总数。 */
  total: number;
  /** 相对最新侧的偏移。 */
  offset: number;
  /** 实际每页条数。 */
  limit: number;
  /** 是否还有更早的匹配行。 */
  hasMore: boolean;
  records: LogRecord[];
  chain?: TraceSummary | null;
};

/** Preload 暴露的工具数据 API。 */
export type ThinkerToolsApi = {
  logsMeta(): Promise<{ logDir: string; files: LogFileInfo[] }>;
  logsTraces(limit?: number): Promise<TraceSummary[]>;
  logsQuery(query: LogsQuery): Promise<LogsResponse>;
};
