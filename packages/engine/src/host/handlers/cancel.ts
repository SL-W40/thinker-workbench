/**
 * cancel / cancelTask：取消整轮运行或单个后台 Task。
 */
import type { UtilityCancel, UtilityCancelTask } from "@thinker-workbench/shared";
import { rejectHitlByRunId } from "../../hitl/requestHitl";
import { cancelBackgroundTasksByRunId, cancelOneBackgroundTask } from "../../tools/task/execute";
import type { HostContext } from "../hostContext";

export function onCancel(ctx: HostContext, message: UtilityCancel): void {
  const runId = message.command.runId?.trim() ?? "";
  if (!runId) return;
  // 仅作用本 run：勿 rejectAll / cancel 全部 Task
  rejectHitlByRunId(runId, "Run cancelled.");
  cancelBackgroundTasksByRunId(runId, "Cancelled.");
  ctx.cancel(runId);
}

/** 取消单个后台 Task；不 abort 父 run。 */
export function onCancelTask(message: UtilityCancelTask): void {
  const taskId = message.command.taskId?.trim() ?? "";
  const runId = message.command.runId?.trim() || undefined;
  if (!taskId) return;
  cancelOneBackgroundTask(taskId, "Cancelled.", {
    expectedParentRunId: runId,
  });
}
