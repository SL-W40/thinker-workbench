/**
 * 删除聊天会话时顺带清理的旁路数据：checkpoint + 会话 Trace。
 * Trace 失败会重试并打日志；仍不拖垮删会话主路径。
 */
import { desktopLog } from "../log/setup";
import { removeSessionJsonl } from "../trace/sessionJsonl";
import { deleteSession as deleteTraceSession } from "../trace/traceDb";
import { clearThreadCheckpoint } from "./checkpointClear";

/** 进程内已 purge 的 sessionId，阻止迟到 span 写回。 */
const purgedSessionIds = new Set<string>();

/** 该聊天会话的 Trace 是否已标记清除（含迟到写入守卫）。 */
export function isSessionArtifactsPurged(sessionId: string): boolean {
  return purgedSessionIds.has(sessionId.trim());
}

/** 标记会话 Trace 已清（Trace 面板单独删除时也调用）。 */
export function markSessionArtifactsPurged(sessionId: string): void {
  const id = sessionId.trim();
  if (id) purgedSessionIds.add(id);
}

/** 测试用：清空 purge 标记。 */
export function resetPurgedSessionArtifactsForTests(): void {
  purgedSessionIds.clear();
}

function tryOnce(label: string, sessionId: string, fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch (err) {
    desktopLog("sessionArtifacts").warn(`${label} failed`, {
      meta: {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return false;
  }
}

/** 按聊天 sessionId / threadId 清理检查点与 Trace（库 + jsonl）。 */
export function purgeSessionArtifacts(input: {
  sessionId: string;
  threadId?: string | null;
}): void {
  const sessionId = input.sessionId.trim();
  const threadId = input.threadId?.trim();
  if (threadId) {
    tryOnce("clearThreadCheckpoint", sessionId, () => clearThreadCheckpoint(threadId));
  }
  if (!sessionId) return;

  // 先标记，避免 purge 过程中迟到的 span 写回
  markSessionArtifactsPurged(sessionId);

  let okDb = tryOnce("deleteTraceSession", sessionId, () => deleteTraceSession(sessionId));
  if (!okDb) {
    okDb = tryOnce("deleteTraceSession.retry", sessionId, () => deleteTraceSession(sessionId));
  }
  let okJsonl = tryOnce("removeSessionJsonl", sessionId, () => removeSessionJsonl(sessionId));
  if (!okJsonl) {
    okJsonl = tryOnce("removeSessionJsonl.retry", sessionId, () => removeSessionJsonl(sessionId));
  }
  if (!okDb || !okJsonl) {
    desktopLog("sessionArtifacts").error("purge incomplete", {
      meta: { sessionId, okDb, okJsonl },
    });
  }
}
