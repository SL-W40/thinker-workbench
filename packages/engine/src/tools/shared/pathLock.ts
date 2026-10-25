/**
 * 写工具的路径建议锁。
 *
 * 同一个 utility 进程里会并行多个 run（leader 或 sub-agent）。只读工具可以随便并发，
 * 但写同一个文件必须串行，否则两条 ToolNode 会互相覆盖成「半截编辑」或丢失更新。
 *
 * 语义（产品已定）：
 * - 同路径：第二个写请求**等待**（不是报错），拿到锁后执行；超过 5s 报明确错误；
 * - 不同路径：完全并行；
 * - 只读工具：完全不参与排队。
 *
 * 不会死锁：锁粒度单一且不存在嵌套申请（写工具内部不会再申请第二把锁），
 * 因此等待图上没有环；异常路径在 finally 里必定释放。
 */
import path from "node:path";

/** 每个规范化绝对路径对应一条串行队列（队尾即当前正在执行的 Promise）。 */
const queues = new Map<string, Promise<unknown>>();

/** 等待锁的超时时长。 */
export const PATH_LOCK_TIMEOUT_MS = 5_000;

/** 锁等待信息（供 UI 提示「等谁释放」）。 */
export type PathLockInfo = {
  path: string;
  waitedMs: number;
};

/** 归一化成绝对路径作为锁键（大小写与分隔符统一，Windows 上按小写比较）。 */
export function normalizeLockKey(workspaceRoot: string, relPath: string): string {
  const abs = path.isAbsolute(relPath)
    ? path.resolve(relPath)
    : path.resolve(workspaceRoot, relPath);
  return process.platform === "win32" ? abs.toLowerCase() : abs;
}

/** 当前有多少条路径正在被写（观测用）。 */
export function activePathLockCount(): number {
  return queues.size;
}

/** 清空所有锁（run 取消后兜底，避免残留队列卡住后续 run）。 */
export function resetPathLocks(): void {
  queues.clear();
}

/**
 * 在指定路径上串行执行写操作。
 * @param fn 真正的写入逻辑（拿到锁后执行）
 * @param onWait 开始等待时回调（用于时间线透出「正在等待另一个会话」）
 */
export function withPathLock<T>(
  workspaceRoot: string,
  relPath: string,
  fn: () => Promise<T>,
  options: { timeoutMs?: number; onWait?: (info: PathLockInfo) => void } = {},
): Promise<T> {
  const key = normalizeLockKey(workspaceRoot, relPath);
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? PATH_LOCK_TIMEOUT_MS;
  const prev = queues.get(key) ?? Promise.resolve();

  const entry = new Promise<T>((outerResolve, outerReject) => {
    // 等待前一条写操作完成（无论成功失败都要继续）
    let settled = false;
    const waitGate = (prev as Promise<unknown>).catch(() => undefined);

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return;
            settled = true;
            outerReject(
              new Error(
                `Another session is still writing ${relPath} (waited ${timeoutMs}ms). Retry in a moment.`,
              ),
            );
          }, timeoutMs)
        : null;

    void waitGate.then(async () => {
      if (settled) return;
      const waitedMs = Date.now() - startedAt;
      // 只有真正排了队才上报（首条写请求无需打扰 UI）
      if (queues.has(key) && waitedMs >= 0 && options.onWait) {
        options.onWait({ path: relPath, waitedMs });
      }
      try {
        const result = await fn();
        settled = true;
        if (timer) clearTimeout(timer);
        outerResolve(result);
      } catch (err) {
        settled = true;
        if (timer) clearTimeout(timer);
        outerReject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });

  // 把自己接到队尾（失败也照常推进队列）；自己是最后一条时清理条目
  const tail = entry.then(
    (value) => value,
    (err) => Promise.reject(err),
  );
  const settledTail = tail.catch(() => undefined);
  queues.set(key, settledTail);
  void settledTail.then(() => {
    if (queues.get(key) === settledTail) queues.delete(key);
  });
  return entry;
}
