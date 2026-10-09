import type { LogLevel, LogRecord, LogSource } from "./types";

const LEVELS = new Set(["debug", "info", "warn", "error"]);
const SOURCES = new Set(["app", "desktop", "agent"]);

/**
 * 解析 `formatLogLine` 写出的单行文本。
 * 无法识别时返回 null。
 */
export function parseLogLine(line: string): LogRecord | null {
  const trimmed = line.trimEnd();
  if (!trimmed) return null;

  const m = trimmed.match(/^(\S+)\s+(DEBUG|INFO|WARN|ERROR)\s+(\S+)\s+(\S+)\s+(.*)$/i);
  if (!m) return null;

  const ts = Date.parse(m[1]!);
  if (!Number.isFinite(ts)) return null;

  const level = m[2]!.toLowerCase() as LogLevel;
  if (!LEVELS.has(level)) return null;

  const source = m[3]!.toLowerCase() as LogSource;
  if (!SOURCES.has(source)) return null;

  const scope = m[4]!;
  let rest = m[5] ?? "";

  const ids: { traceId?: string; runId?: string; threadId?: string; spanId?: string } = {};
  for (;;) {
    const km = rest.match(/^(trace|run|thread|span)=(\S+)(?:\s+(.*))?$/);
    if (!km) break;
    const key = km[1]!;
    const value = km[2]!;
    rest = km[3] ?? "";
    if (key === "trace") ids.traceId = value;
    else if (key === "run") ids.runId = value;
    else if (key === "thread") ids.threadId = value;
    else if (key === "span") ids.spanId = value;
  }

  let message = rest;
  let meta: Record<string, unknown> | undefined;
  const brace = rest.lastIndexOf(" {");
  if (brace >= 0) {
    const maybeJson = rest.slice(brace + 1).trim();
    if (maybeJson.startsWith("{") && maybeJson.endsWith("}")) {
      try {
        meta = JSON.parse(maybeJson) as Record<string, unknown>;
        message = rest.slice(0, brace).trimEnd();
      } catch {
        /* keep full rest as message */
      }
    }
  }

  return {
    level,
    source,
    scope,
    message,
    ts,
    ...ids,
    ...(meta ? { meta } : {}),
  };
}
