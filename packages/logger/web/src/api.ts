/**
 * 日志查看 API：产品走 `thinker.tools` IPC；独立 Vite 回退到 `/api/*`。
 */
import type { LogFileInfo, LogsQuery, LogsResponse, TraceSummary } from "@thinker-workbench/shared";

export type { LogFileInfo, LogsQuery, LogsResponse, TraceSummary };

export async function fetchMeta(): Promise<{ logDir: string; files: LogFileInfo[] }> {
  const tools = window.thinker?.tools;
  if (tools?.logsMeta) return tools.logsMeta();

  const res = await fetch("/api/meta");
  if (!res.ok) throw new Error(`meta ${res.status}`);
  return res.json() as Promise<{ logDir: string; files: LogFileInfo[] }>;
}

export async function fetchTraces(limit = 60): Promise<TraceSummary[]> {
  const tools = window.thinker?.tools;
  if (tools?.logsTraces) return tools.logsTraces(limit);

  const res = await fetch(`/api/traces?limit=${limit}`);
  if (!res.ok) throw new Error(`traces ${res.status}`);
  const data = (await res.json()) as { traces: TraceSummary[] };
  return data.traces ?? [];
}

export async function fetchLogs(query: LogsQuery): Promise<LogsResponse> {
  const tools = window.thinker?.tools;
  if (tools?.logsQuery) return tools.logsQuery(query);

  const params = new URLSearchParams();
  params.set("file", query.file);
  if (query.q) params.set("q", query.q);
  if (query.level) params.set("level", query.level);
  if (query.source) params.set("source", query.source);
  if (query.traceId) params.set("traceId", query.traceId);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset != null) params.set("offset", String(query.offset));
  const res = await fetch(`/api/logs?${params}`);
  if (!res.ok) throw new Error(`logs ${res.status}`);
  return res.json() as Promise<LogsResponse>;
}
