/**
 * 删除聊天会话时顺带清理 checkpoint 与 Trace 数据。
 */

import { removeSessionJsonl } from "../trace/sessionJsonl";
import { deleteSession as deleteObsSession } from "../trace/traceDb";
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
export function purgeSessionArtifacts(opts: { sessionId: string; threadId?: string | null }): void {
  markSessionArtifactsPurged(opts.sessionId);
  try {
    deleteObsSession(opts.sessionId);
    removeSessionJsonl(opts.sessionId);
  } catch {
    /* ignore */
  }
  const tid = opts.threadId?.trim();
  if (!tid) return;
  try {
    clearThreadCheckpoint(tid);
  } catch {
    /* ignore */
  }
}
