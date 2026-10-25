/**
 * 按内置默认清理本机 Trace（天 / 会话数 / 总字节）。
 *
 * Trace 按工作区分库，配额解释为「每工作区上限」：
 * 避免一个活跃工作区吃掉全部预算，也让删工作区时整目录带走即可。
 */
import {
  DEFAULT_TRACE_MAX_SESSIONS,
  DEFAULT_TRACE_MAX_TOTAL_BYTES,
  DEFAULT_TRACE_RETENTION_DAYS,
} from "@thinker-workbench/shared";
import { removeSessionJsonl, totalSessionsBytes } from "./sessionJsonl";
import { deleteSession, listSessionsOldestFirst, sessionCount } from "./traceDb";
import { listWorkspaceIds } from "./workspaceTraceDb";

export type PruneTraceResult = {
  removedSessions: number;
};

/** 清理单个工作区的 Trace。 */
function pruneWorkspace(workspaceId: string): number {
  let removed = 0;
  const now = Date.now();

  if (DEFAULT_TRACE_RETENTION_DAYS > 0) {
    const cutoff = now - DEFAULT_TRACE_RETENTION_DAYS * 86_400_000;
    for (const s of listSessionsOldestFirst(workspaceId)) {
      if (s.lastTs >= cutoff) break;
      deleteSession(workspaceId, s.sessionId);
      removeSessionJsonl(workspaceId, s.sessionId);
      removed += 1;
    }
  }

  if (DEFAULT_TRACE_MAX_SESSIONS > 0) {
    while (sessionCount(workspaceId) > DEFAULT_TRACE_MAX_SESSIONS) {
      const oldest = listSessionsOldestFirst(workspaceId)[0];
      if (!oldest) break;
      deleteSession(workspaceId, oldest.sessionId);
      removeSessionJsonl(workspaceId, oldest.sessionId);
      removed += 1;
    }
  }

  if (DEFAULT_TRACE_MAX_TOTAL_BYTES > 0) {
    while (totalSessionsBytes(workspaceId) > DEFAULT_TRACE_MAX_TOTAL_BYTES) {
      const oldest = listSessionsOldestFirst(workspaceId)[0];
      if (!oldest) break;
      deleteSession(workspaceId, oldest.sessionId);
      removeSessionJsonl(workspaceId, oldest.sessionId);
      removed += 1;
    }
  }

  return removed;
}

/** 清理全部（或指定）工作区的 Trace。 */
export function pruneTraceStore(workspaceId?: string): PruneTraceResult {
  const targets = workspaceId?.trim() ? [workspaceId.trim()] : listWorkspaceIds();
  let removed = 0;
  for (const id of targets) {
    try {
      removed += pruneWorkspace(id);
    } catch {
      /* 单个工作区失败不阻断其余 */
    }
  }
  return { removedSessions: removed };
}
