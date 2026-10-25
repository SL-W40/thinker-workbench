/**
 * 删除聊天会话时顺带清理 checkpoint 与 Trace 数据。
 *
 * Trace 与 checkpoint 都在工作区目录下，因此必须知道 workspaceId。
 */
import { removeSessionJsonl } from "../trace/sessionJsonl";
import { deleteSession as deleteObsSession } from "../trace/traceDb";
import { resolveWorkspaceIdForSession } from "../trace/workspaceTraceDb";
import { clearThreadCheckpoint } from "./checkpointClear";

const purgedSessionIds = new Set<string>();

export function isSessionArtifactsPurged(sessionId: string): boolean {
  return purgedSessionIds.has(sessionId.trim());
}

export function markSessionArtifactsPurged(sessionId: string): void {
  const id = sessionId.trim();
  if (id) purgedSessionIds.add(id);
}

export function resetPurgedSessionArtifactsForTests(): void {
  purgedSessionIds.clear();
}

/** 删会话时清 checkpoint + 本地观测；失败不拖垮主路径。 */
export function purgeSessionArtifacts(opts: {
  sessionId: string;
  workspaceId: string;
  threadId?: string | null;
}): void {
  const sessionId = opts.sessionId.trim();
  markSessionArtifactsPurged(sessionId);
  const workspaceId = opts.workspaceId?.trim() || resolveWorkspaceIdForSession(sessionId);
  if (workspaceId) {
    try {
      deleteObsSession(workspaceId, sessionId);
      removeSessionJsonl(workspaceId, sessionId);
    } catch {
      /* ignore */
    }
  }
  const tid = opts.threadId?.trim();
  if (!tid || !workspaceId) return;
  try {
    clearThreadCheckpoint(workspaceId, tid);
  } catch {
    /* ignore */
  }
}
