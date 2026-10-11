/**
 * 删除聊天会话时顺带清理的旁路数据：checkpoint + 会话 Trace。
 * 失败忽略，避免拖垮会话删除主路径。
 */
import { clearThreadCheckpoint } from "./checkpointClear";
import { removeSessionJsonl } from "../trace/sessionJsonl";
import { deleteSession as deleteTraceSession } from "../trace/traceDb";

/** 按聊天 sessionId / threadId 清理检查点与 Trace（库 + jsonl）。 */
export function purgeSessionArtifacts(input: {
  sessionId: string;
  threadId?: string | null;
}): void {
  const sessionId = input.sessionId.trim();
  const threadId = input.threadId?.trim();
  if (threadId) {
    try {
      clearThreadCheckpoint(threadId);
    } catch {
      /* ignore */
    }
  }
  if (!sessionId) return;
  try {
    deleteTraceSession(sessionId);
  } catch {
    /* ignore */
  }
  try {
    removeSessionJsonl(sessionId);
  } catch {
    /* ignore */
  }
}
