/**
 * Task / task_await / task_cancel 执行入口：隔离子代理 run（可 await 或后台 + 稍后 await）。
 * 子代理不改全局 ChatMode（避免并行互踩）；只读靠 childReadonly 收紧工具。
 * 后台 Task 自带 AbortController；cancelOne 真停单路，父 run 可继续。
 *
 * 后台任务注册表（atif 记录与取消）、await 等待语义、子代理一轮执行、卡片文案
 * 已分别拆到 `backgroundRegistry` / `awaitBackgroundTask` / `runChildAgent` / `childLiveText`；
 * 本文件只保留三个工具入口与 tools 节点用的 `peekTaskLaunchesInBackground`。
 * 保留 re-export 是为了不打乱既有 `tools/task/execute` 导入路径。
 */
import { createId } from "@thinker-workbench/shared";
import { getRunContext } from "../../runtime/runContext";
import { getRunIds } from "../../runtime/runEmit";
import { getSubagentDefinition, listSubagentDefinitions } from "../../subagents/registry";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";
import { parseBlockUntilMs, parseBool } from "./argParsing";
import { awaitBackgroundTask } from "./awaitBackgroundTask";
import {
  type BackgroundTask,
  backgroundTasks,
  cancelOneBackgroundTask,
  DEFAULT_AWAIT_MS,
  markTaskTerminal,
  mergeAbortSignals,
  pruneSettledBackgroundTasks,
  transitionBackgroundTask,
} from "./backgroundRegistry";
import { emitSubagent } from "./childLiveText";
import { runChildAgent } from "./runChildAgent";
import { deriveTaskTitle } from "./title";

export * from "./awaitBackgroundTask";
export * from "./backgroundRegistry";

/** 是否后台启动（不阻塞本轮工具返回）。 */
function resolveUseBackground(args: ToolArgs, defIsBackground: boolean): boolean {
  const awaitOpt = parseBool(args.await);
  if (awaitOpt === true) return false;
  if (awaitOpt === false) return true;
  return Boolean(defIsBackground);
}

/**
 * 供 tools 节点判断：该 Task 调用是否会立刻返回（可并行启动）。
 * 参数不完整或未知子代理时返回 false，走串行以免误并行阻塞型 Task。
 */
export function peekTaskLaunchesInBackground(args: ToolArgs): boolean {
  const name = typeof args.subagent === "string" ? args.subagent.trim() : "";
  if (!name) return false;
  const def = getSubagentDefinition(name);
  if (!def) return false;
  return resolveUseBackground(args, def.isBackground);
}

/** Task 工具入口。 */
export async function runTaskTool(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
  const name = typeof args.subagent === "string" ? args.subagent.trim() : "";
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  if (!name || !prompt) {
    return { ok: false, output: "Task requires subagent and prompt." };
  }

  const def = getSubagentDefinition(name);
  if (!def) {
    const available = listSubagentDefinitions()
      .map((a) => a.name)
      .join(", ");
    return {
      ok: false,
      output: `Unknown subagent "${name}". Available: ${available || "(none)"}`,
    };
  }

  const useBackground = resolveUseBackground(args, def.isBackground);
  // 与流式预告共用 callId，避免文案已出、卡片却要等 tools 节点才出现
  const taskId = ctx.callId?.trim() || createId("task");
  const titleArg = typeof args.title === "string" ? args.title : undefined;
  const title = deriveTaskTitle(titleArg, prompt);
  const modelArg =
    typeof args.model === "string" && args.model.trim() ? args.model.trim() : def.model;
  const systemBody = [
    `You are the "${def.name}" subagent.`,
    def.description ? `Role: ${def.description}` : "",
    def.body,
  ]
    .filter(Boolean)
    .join("\n\n");

  emitSubagent("started", {
    taskId,
    subagent: def.name,
    title,
    background: useBackground,
    liveLine: "Starting…",
    childEvent: { type: "status", status: "planning" },
  });

  if (useBackground) {
    pruneSettledBackgroundTasks();
    let markSettled = (): void => {};
    const settled = new Promise<void>((resolve) => {
      markSettled = resolve;
    });
    const parentRunId = getRunIds()?.runId ?? "";
    const abort = new AbortController();
    const entry: BackgroundTask = {
      subagent: def.name,
      parentRunId,
      status: "running",
      summary: "",
      settled,
      markSettled,
      abort,
    };
    backgroundTasks.set(taskId, entry);
    if (parentRunId) getRunContext()?.taskIds.add(taskId);
    const childSignal = mergeAbortSignals(ctx.signal, abort.signal);
    const childOpts = {
      systemBody,
      prompt,
      readonly: def.readonly,
      signal: childSignal,
      taskId,
      subagent: def.name,
      title,
      background: useBackground,
      model: modelArg,
    };
    void (async () => {
      try {
        const result = await runChildAgent(childOpts);
        if (
          !transitionBackgroundTask(entry, result.ok ? "finished" : "failed", {
            summary: result.summary,
            error: result.ok ? undefined : result.summary,
          })
        ) {
          return;
        }
        emitSubagent(result.ok ? "finished" : "failed", {
          taskId,
          subagent: def.name,
          background: true,
          summary: result.summary,
          error: result.ok ? undefined : result.summary,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        if (!transitionBackgroundTask(entry, "failed", { summary: "", error })) {
          return;
        }
        emitSubagent("failed", {
          taskId,
          subagent: def.name,
          background: true,
          error,
        });
      } finally {
        if (entry.status === "running") {
          transitionBackgroundTask(entry, "failed", {
            error: entry.error || "Task ended unexpectedly.",
          });
        }
        if (entry.settledAt == null) markTaskTerminal(entry);
      }
    })();
    return {
      ok: true,
      output: JSON.stringify({
        taskId,
        status: "running",
        subagent: def.name,
        backgrounded: true,
        hint: `Call task_await with taskId when you need the result (same pattern as shell_await). Cancel with task_cancel if you no longer need it.`,
      }),
      ui: { taskId, backgrounded: true },
    };
  }

  const childOpts = {
    systemBody,
    prompt,
    readonly: def.readonly,
    signal: ctx.signal,
    taskId,
    subagent: def.name,
    title,
    background: useBackground,
    model: modelArg,
  };

  try {
    const result = await runChildAgent(childOpts);
    emitSubagent(result.ok ? "finished" : "failed", {
      taskId,
      subagent: def.name,
      background: false,
      summary: result.summary,
      error: result.ok ? undefined : result.summary,
    });
    return {
      ok: result.ok,
      output: JSON.stringify({
        taskId,
        status: result.ok ? "finished" : "failed",
        subagent: def.name,
        backgrounded: false,
        summary: result.summary,
      }),
      ui: { taskId, backgrounded: false },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emitSubagent("failed", { taskId, subagent: def.name, error });
    return { ok: false, output: error, ui: { taskId } };
  }
}

/** task_await 工具入口。 */
export async function runTaskAwaitTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  pruneSettledBackgroundTasks();
  const taskId = typeof args.taskId === "string" ? args.taskId.trim() : "";
  const blockUntilMs = parseBlockUntilMs(args.block_until_ms, DEFAULT_AWAIT_MS);
  return awaitBackgroundTask(taskId, blockUntilMs, ctx.signal);
}

/** task_cancel：按 taskId 真停单路后台 Task；父 run 继续。 */
export async function runTaskCancelTool(
  args: ToolArgs,
  _ctx: ToolContext,
): Promise<ToolExecuteResult> {
  pruneSettledBackgroundTasks();
  const taskId = typeof args.taskId === "string" ? args.taskId.trim() : "";
  if (!taskId) return { ok: false, output: "taskId is required." };
  const parentRunId = getRunIds()?.runId;
  const result = cancelOneBackgroundTask(taskId, "Cancelled by task_cancel.", {
    expectedParentRunId: parentRunId,
  });
  if (!result.ok) {
    return { ok: false, output: result.error || `Unknown taskId: ${taskId}`, ui: { taskId } };
  }
  return {
    ok: true,
    output: JSON.stringify({
      taskId,
      status: "cancelled",
      hint: "Background task cancelled; parent run continues.",
    }),
    ui: { taskId, backgrounded: false },
  };
}
