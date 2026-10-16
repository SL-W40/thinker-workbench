/**
 * 按内置默认清理本机 Trace（天 / 会话数 / 总字节）。
 */
import {
  DEFAULT_TRACE_MAX_SESSIONS,
  DEFAULT_TRACE_MAX_TOTAL_BYTES,
  DEFAULT_TRACE_RETENTION_DAYS,
} from "@thinker-workbench/shared";
import { removeSessionJsonl, totalSessionsBytes } from "./sessionJsonl";
import { deleteSession, listSessionsOldestFirst, sessionCount } from "./traceDb";

export type PruneTraceResult = {
  removedSessions: number;
};

export function pruneTraceStore(): PruneTraceResult {
  let removed = 0;
  const now = Date.now();

  if (DEFAULT_TRACE_RETENTION_DAYS > 0) {
    const cutoff = now - DEFAULT_TRACE_RETENTION_DAYS * 86_400_000;
    for (const s of listSessionsOldestFirst()) {
      if (s.lastTs >= cutoff) break;
      deleteSession(s.sessionId);
      removeSessionJsonl(s.sessionId);
      removed += 1;
    }
  }

  if (DEFAULT_TRACE_MAX_SESSIONS > 0) {
    while (sessionCount() > DEFAULT_TRACE_MAX_SESSIONS) {
      const oldest = listSessionsOldestFirst()[0];
      if (!oldest) break;
      deleteSession(oldest.sessionId);
      removeSessionJsonl(oldest.sessionId);
      removed += 1;
    }
  }

  if (DEFAULT_TRACE_MAX_TOTAL_BYTES > 0) {
    while (totalSessionsBytes() > DEFAULT_TRACE_MAX_TOTAL_BYTES) {
      const oldest = listSessionsOldestFirst()[0];
      if (!oldest) break;
      deleteSession(oldest.sessionId);
      removeSessionJsonl(oldest.sessionId);
      removed += 1;
    }
  }

  return { removedSessions: removed };
}
