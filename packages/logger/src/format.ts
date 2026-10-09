import type { LogRecord } from "./types";

/** 单行文本，便于文件 sink / 终端阅读。 */
export function formatLogLine(record: LogRecord): string {
  const time = new Date(record.ts).toISOString();
  const parts = [time, record.level.toUpperCase().padEnd(5), record.source, record.scope];
  if (record.traceId) parts.push(`trace=${record.traceId}`);
  if (record.runId) parts.push(`run=${record.runId}`);
  if (record.threadId) parts.push(`thread=${record.threadId}`);
  if (record.spanId) parts.push(`span=${record.spanId}`);
  let line = `${parts.join(" ")} ${record.message}`;
  if (record.meta && Object.keys(record.meta).length > 0) {
    try {
      line += ` ${JSON.stringify(record.meta)}`;
    } catch {
      /* ignore */
    }
  }
  return line;
}
