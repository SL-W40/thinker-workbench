/**
 * 后台 Task 注册表：隔离每路子代理 run 的记录、取消与 TTL 回收。
 *
 * 原属 `tools/task/execute.ts`；连 AbortController 一起管理，
 * 保证 cancelOne 真停单路后台 Task，而父 run 不受影响。
 */
import { createId, isRecord } from "@thinker-workbench/shared";
import { startedToolCallIdSet } from "../../graph/nodes/toolsResume";
import type { GraphState } from "../../graph/types";
import { getRunIds } from "../../runtime/runEmit";
import { emitSubagent } from "./childLiveText";

/** task_await 默认等待（与 shell 默认无关）。 */
export const DEFAULT_AWAIT_MS = 30_000;

export const BACKGROUND_TASK_TTL_MS = 15 * 60 * 1000;
type BgStatus = "running" | "finished" | "failed" | "cancelled";

export type BackgroundTask = {
  subagent: string;
  /** 父 run id；cancel 按 run 作用域。 */
  parentRunId: string;
  status: BgStatus;
  summary: string;
  error?: string;
  /** 完成后 resolve；供 task_await 等待。 */
  settled: Promise<void>;
  markSettled: () => void;
  /** 本 Task 专用 abort；与父 run signal 合并后交给子代理。 */
  abort: AbortController;
  /** 进入终态的时间；供 TTL prune。 */
  settledAt?: number;
};

/**
 * 后台 Task 唯一状态迁移：仅 running → finished/failed/cancelled，后写无效。
 * @returns 是否本调用完成了迁移
 */
export function transitionBackgroundTask(
  entry: BackgroundTask,
  next: Exclude<BgStatus, "running">,
  patch?: { summary?: string; error?: string },
): boolean {
  if (entry.status !== "running") return false;
  entry.status = next;
  if (patch?.summary !== undefined) entry.summary = patch.summary;
  if (patch?.error !== undefined) entry.error = patch.error;
  return true;
}

export const backgroundTasks = new Map<string, BackgroundTask>();

/** 串行化子代理临时切模型，避免并行互相覆盖 catalog。 */
let modelGate: Promise<void> = Promise.resolve();

/** 读取当前模型切换闸门（子代理串行修改 catalog 时用）。 */
export function getModelGate(): Promise<void> {
  return modelGate;
}

/**
 * 替换模型切换闸门并返回旧值：新闸门由调用方持有 resolve，
 * 前一个子代理跑完 release 后才能继续，避免并行互相 restore catalog。
 */
export function swapModelGate(next: Promise<void>): void {
  modelGate = next;
}

/** 合并父 run 与 task 信号；任一 abort 则子代理停。 */
export function mergeAbortSignals(parent: AbortSignal, task: AbortSignal): AbortSignal {
  const anyFn = (
    AbortSignal as typeof AbortSignal & {
      any?: (signals: AbortSignal[]) => AbortSignal;
    }
  ).any;
  if (typeof anyFn === "function") {
    return anyFn.call(AbortSignal, [parent, task]);
  }
  const merged = new AbortController();
  const onAbort = () => {
    if (!merged.signal.aborted) merged.abort();
  };
  if (parent.aborted || task.aborted) {
    merged.abort();
    return merged.signal;
  }
  parent.addEventListener("abort", onAbort, { once: true });
  task.addEventListener("abort", onAbort, { once: true });
  return merged.signal;
}

/** 机会式删除过期的已收束条目。 */
export function pruneSettledBackgroundTasks(now = Date.now()): number {
  let removed = 0;
  for (const [taskId, task] of backgroundTasks) {
    if (task.status === "running") continue;
    const at = task.settledAt ?? 0;
    if (at > 0 && now - at >= BACKGROUND_TASK_TTL_MS) {
      backgroundTasks.delete(taskId);
      removed += 1;
    }
  }
  return removed;
}

export function markTaskTerminal(task: BackgroundTask): void {
  task.settledAt = Date.now();
  task.markSettled();
  pruneSettledBackgroundTasks();
}

/** 仅取消指定父 run 派生的后台 Task。 */
export function cancelBackgroundTasksByRunId(runId: string, reason = "Cancelled."): void {
  const id = runId?.trim();
  if (!id) return;
  for (const [taskId, task] of backgroundTasks) {
    if (task.parentRunId !== id) continue;
    cancelOneBackgroundTask(taskId, reason);
  }
}

/**
 * 取消单个后台 Task（工具 / UI / 整 run cancel 的唯一执法点）。
 * @returns 是否找到并处理了该 taskId（含已非 running 的幂等成功）
 */
export function cancelOneBackgroundTask(
  taskId: string,
  reason = "Cancelled.",
  options?: { expectedParentRunId?: string },
): { ok: boolean; error?: string } {
  pruneSettledBackgroundTasks();
  const id = taskId?.trim();
  if (!id) return { ok: false, error: "taskId is required." };
  const task = backgroundTasks.get(id);
  if (!task) return { ok: false, error: `Unknown taskId: ${id}` };
  const expected = options?.expectedParentRunId?.trim();
  if (expected && task.parentRunId && task.parentRunId !== expected) {
    return { ok: false, error: "taskId does not belong to this run." };
  }
  if (!transitionBackgroundTask(task, "cancelled", { summary: "", error: reason })) {
    return { ok: true };
  }
  try {
    task.abort.abort();
  } catch {
    /* ignore */
  }
  emitSubagent("cancelled", {
    taskId: id,
    subagent: task.subagent,
    background: true,
    error: reason,
    summary: reason,
  });
  markTaskTerminal(task);
  return { ok: true };
}

/**
 * Resume / interrupt：为已开工无结果的 Task 种 failed 孤儿条目，供 task_await。
 * 已存在则不覆盖 running/终态。
 */
export function seedFailedBackgroundTask(
  taskId: string,
  options?: { reason?: string; subagent?: string; parentRunId?: string },
): void {
  pruneSettledBackgroundTasks();
  const id = taskId?.trim();
  if (!id) return;
  const existing = backgroundTasks.get(id);
  if (existing) return;
  const reason =
    options?.reason?.trim() ||
    "Interrupted by process crash while this Task was in progress; outcome is uncertain.";
  let markSettled = (): void => {};
  const settled = new Promise<void>((resolve) => {
    markSettled = resolve;
  });
  const entry: BackgroundTask = {
    subagent: options?.subagent?.trim() || "unknown",
    parentRunId: options?.parentRunId?.trim() || getRunIds()?.runId || "",
    status: "failed",
    summary: "",
    error: reason,
    settled,
    markSettled,
    abort: new AbortController(),
    settledAt: Date.now(),
  };
  backgroundTasks.set(id, entry);
  markSettled();
  pruneSettledBackgroundTasks();
}

/**
 * resume 入口：根据 GraphState 中已开工的 Task callId 种 failed 孤儿。
 */
export function seedFailedOrphanTasksFromState(state: GraphState, parentRunId: string): void {
  const started = startedToolCallIdSet(state);
  if (started.size === 0) return;
  for (const call of state.pendingToolCalls ?? []) {
    if (call.function.name !== "Task") continue;
    const callId = call.id?.trim();
    if (!callId || !started.has(callId)) continue;
    const hasResult = state.messages.some((m) => m.role === "tool" && m.tool_call_id === callId);
    if (hasResult) continue;
    let subagent = "unknown";
    try {
      const args = JSON.parse(call.function.arguments || "{}") as { subagent?: unknown };
      if (isRecord(args) && typeof args.subagent === "string" && args.subagent.trim()) {
        subagent = args.subagent.trim();
      }
    } catch {
      /* ignore */
    }
    seedFailedBackgroundTask(callId, {
      subagent,
      parentRunId,
      reason: "Interrupted by process crash while this Task was in progress; outcome is uncertain.",
    });
  }
}

/** 测试用：清空 Map。 */
export function clearBackgroundTasksForTests(): void {
  backgroundTasks.clear();
}

/** 测试用：登记一条 running 后台 Task（含 AbortController）。 */
export function registerRunningBackgroundTaskForTests(
  taskId: string,
  options?: { parentRunId?: string; subagent?: string },
): AbortSignal {
  const id = taskId.trim();
  let markSettled = (): void => {};
  const settled = new Promise<void>((resolve) => {
    markSettled = resolve;
  });
  const abort = new AbortController();
  backgroundTasks.set(id, {
    subagent: options?.subagent?.trim() || "test",
    parentRunId: options?.parentRunId?.trim() || "run-test",
    status: "running",
    summary: "",
    settled,
    markSettled,
    abort,
  });
  return abort.signal;
}

/** 测试用：读单条状态。 */
export function getBackgroundTaskForTests(taskId: string): {
  status: BgStatus;
  parentRunId: string;
  error?: string;
  settledAt?: number;
  aborted: boolean;
} | null {
  const t = backgroundTasks.get(taskId.trim());
  if (!t) return null;
  return {
    status: t.status,
    parentRunId: t.parentRunId,
    error: t.error,
    settledAt: t.settledAt,
    aborted: t.abort.signal.aborted,
  };
}
