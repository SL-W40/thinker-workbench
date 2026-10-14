/**
 * 将高频 PTY `data` 广播合并到短时间窗，降低 Electron IPC 压力。
 * Agent waiter / spill 仍走原始 chunk，不受此批处理影响。
 */

export type DataBroadcastBatcher = {
  /** 追加待广播 chunk；同会话在时间窗内拼接为一次 send。 */
  enqueue(sessionId: string, data: string): void;
  /** 立即刷出指定会话（或全部）的待发数据。 */
  flush(sessionId?: string): void;
  /** 退出前刷空并清计时器。 */
  dispose(): void;
};

/**
 * @param send 实际广播回调（通常 `webContents.send`）
 * @param delayMs 合并窗口；约一帧量级即可明显减负
 */
export function createDataBroadcastBatcher(
  send: (sessionId: string, data: string) => void,
  delayMs = 12,
): DataBroadcastBatcher {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
  }

  function flushOne(sessionId: string): void {
    const data = pending.get(sessionId);
    if (data == null) return;
    pending.delete(sessionId);
    if (data) send(sessionId, data);
  }

  function flush(sessionId?: string): void {
    if (sessionId != null) {
      flushOne(sessionId);
      if (pending.size === 0) clearTimer();
      return;
    }
    clearTimer();
    const entries = [...pending.entries()];
    pending.clear();
    for (const [id, data] of entries) {
      if (data) send(id, data);
    }
  }

  function enqueue(sessionId: string, data: string): void {
    if (!data) return;
    pending.set(sessionId, (pending.get(sessionId) ?? "") + data);
    if (timer == null) {
      timer = setTimeout(() => flush(), delayMs);
    }
  }

  function dispose(): void {
    flush();
  }

  return { enqueue, flush, dispose };
}
