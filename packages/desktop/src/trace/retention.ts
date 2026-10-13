/**
 * 按配置清理会话 Trace（天 / 会话数 / 总字节）。
 */
import { getGeneralSettings } from "../config/settingsStore";
import { removeSessionJsonl, totalSessionsBytes } from "./sessionJsonl";
import { deleteSession, listSessionsOldestFirst, sessionCount } from "./traceDb";

export type PruneTraceResult = {
  removedSessions: number;
};

export function pruneTraceStore(): PruneTraceResult {
  const g = getGeneralSettings();
  let removed = 0;
  const now = Date.now();

  if (g.traceRetentionDays > 0) {
    const cutoff = now - g.traceRetentionDays * 86_400_000;
    for (const s of listSessionsOldestFirst()) {
      if (s.lastTs >= cutoff) break;
      deleteSession(s.sessionId);
      removeSessionJsonl(s.sessionId);
      removed += 1;
    }
  }

  if (g.traceMaxSessions > 0) {
    while (sessionCount() > g.traceMaxSessions) {
      const oldest = listSessionsOldestFirst()[0];
      if (!oldest) break;
      deleteSession(oldest.sessionId);
      removeSessionJsonl(oldest.sessionId);
      removed += 1;
    }
  }

  if (g.traceMaxTotalBytes > 0) {
    while (totalSessionsBytes() > g.traceMaxTotalBytes) {
      const oldest = listSessionsOldestFirst()[0];
      if (!oldest) break;
      deleteSession(oldest.sessionId);
      removeSessionJsonl(oldest.sessionId);
      removed += 1;
    }
  }

  return { removedSessions: removed };
}
