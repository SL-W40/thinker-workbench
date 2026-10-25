/**
 * task_await 等待语义：最多等 `blockUntilMs`（超时仍返回 ok:true，与 shell_await 一致）。
 */
import type { ToolExecuteResult } from "../types";
import { type BackgroundTask, backgroundTasks } from "./backgroundRegistry";
import { formatTaskSnapshot } from "./childLiveText";

/**
 * 等待后台 Task 结束或超时。
 * running 超时仍返回 ok:true（与 shell_await 一致，不算失败）。
 */
export async function awaitBackgroundTask(
  taskId: string,
  blockUntilMs: number,
  signal: AbortSignal,
): Promise<ToolExecuteResult> {
  const id = taskId.trim();
  if (!id) return { ok: false, output: "taskId is required." };
  const task = backgroundTasks.get(id);
  if (!task) return { ok: false, output: `Unknown taskId: ${id}` };

  if (task.status === "running" && blockUntilMs > 0) {
    if (signal.aborted) {
      return { ok: false, output: "task_await cancelled.", ui: { taskId: id } };
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abortPromise = new Promise<"abort">((resolve) => {
      signal.addEventListener("abort", () => resolve("abort"), { once: true });
    });
    try {
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), blockUntilMs);
      });
      await Promise.race([task.settled.then(() => "done" as const), timeout, abortPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (signal.aborted) {
      return { ok: false, output: "task_await cancelled.", ui: { taskId: id } };
    }
  }

  const latest = backgroundTasks.get(id) ?? task;
  const output = formatTaskSnapshot(id, latest);
  if (latest.status === "failed" || latest.status === "cancelled") {
    return {
      ok: false,
      output,
      ui: { taskId: id, backgrounded: false },
    };
  }
  return {
    ok: true,
    output,
    ui: {
      taskId: id,
      backgrounded: latest.status === "running",
    },
  };
}
