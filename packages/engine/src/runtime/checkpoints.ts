/**
 * checkpoint 释放与线程清理（best-effort，失败只记日志）。
 */
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { clearRunKey, clearThreadKeys, lookupRunKey } from "../checkpoint/threadsIndex";

/**
 * run 结束后的 checkpoint 释放：deleteThread + 清登记。
 * best-effort：任何失败只记日志，不影响 run 终态。
 */
export function releaseCheckpoint(
  checkpointer: BaseCheckpointSaver,
  checkpointDir: string | undefined,
  threadKey: string,
  threadId: string,
): void {
  try {
    void checkpointer.deleteThread?.(threadKey);
  } catch (err) {
    console.warn(
      "[engine] checkpoint deleteThread failed:",
      err instanceof Error ? err.message : err,
    );
  }
  try {
    clearRunKey(checkpointDir, threadId, threadKey);
  } catch {
    /* 登记清理失败不影响 run */
  }
}

/**
 * 清理会话线程的全部 checkpoint（删会话时由 desktop 经 host 通道调用）。
 * 覆盖登记表中的 runKey；best-effort。
 */
export async function clearThreadCheckpoints(
  checkpointer: BaseCheckpointSaver,
  checkpointDir: string | undefined,
  threadId: string,
): Promise<void> {
  const tid = threadId.trim();
  if (!tid) return;
  const keys = new Set<string>();
  try {
    const mapped = lookupRunKey(checkpointDir, tid);
    if (mapped) keys.add(mapped);
  } catch {
    /* 登记读取失败仍尝试清理已知键 */
  }
  for (const key of keys) {
    try {
      await checkpointer.deleteThread?.(key);
    } catch (err) {
      console.warn(
        "[engine] checkpoint deleteThread failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }
  try {
    clearThreadKeys(checkpointDir, tid);
  } catch {
    /* 登记清理失败不影响删除主流程 */
  }
}
