/**
 * Task / task_await / task_cancel 执行：隔离子代理 run（可 await 或后台 + 稍后 await）。
 * 子代理不改全局 ChatMode（避免并行互踩）；只读靠 childReadonly 收紧工具。
 * 后台 Task 自带 AbortController；cancelOne 真停单路，父 run 可继续。
 */
import { createId, isRecord, type SubagentChildEvent } from "@thinker-workbench/shared";
import { getLimit } from "../../config/runtimeLimits";
import { assembleContext } from "../../context/assembleContext";
import { startedToolCallIdSet } from "../../graph/nodes/toolsResume";
import type { GraphState } from "../../graph/types";
import { chatWithFailover, configureModelCatalog, getModelSelection } from "../../model/catalog";
import { getAiLocale, getAllowEmoji, getContextWindow } from "../../model/openai";
import type { ChatMessage } from "../../model/types";
import { joinSystemSections } from "../../prompts/systemSections";
import {
  getRunContext,
  getRunTurn,
  type RunContext,
  runWithContext,
} from "../../runtime/runContext";
import { getRunEmitter, getRunIds } from "../../runtime/runEmit";
import { getSubagentDefinition, listSubagentDefinitions } from "../../subagents/registry";
import { agentEndSpan, agentStartSpan, runWithAgentTaskId } from "../../trace/emit";
import { getWorkspaceRootOrNull } from "../../workspace";
import { runTool } from "../runTool";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";
import { deriveTaskTitle } from "./title";

/** task_await 默认等待（与 shell 默认无关）。 */
const DEFAULT_AWAIT_MS = 30_000;
/** 已收束后台 Task 在 Map 中保留时长（毫秒）；机会式 prune。 */
export const BACKGROUND_TASK_TTL_MS = 15 * 60 * 1000;
type BgStatus = "running" | "finished" | "failed" | "cancelled";

type BackgroundTask = {
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
function transitionBackgroundTask(
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

const backgroundTasks = new Map<string, BackgroundTask>();

/** 串行化子代理临时切模型，避免并行互相覆盖 catalog。 */
let modelGate: Promise<void> = Promise.resolve();

/** 合并父 run 与 task 信号；任一 abort 则子代理停。 */
function mergeAbortSignals(parent: AbortSignal, task: AbortSignal): AbortSignal {
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

function markTaskTerminal(task: BackgroundTask): void {
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

function parseBool(value: unknown): boolean | undefined {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  return undefined;
}

function parseBlockUntilMs(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return fallback;
}

function emitSubagent(
  phase: "started" | "progress" | "finished" | "failed" | "cancelled",
  payload: {
    taskId: string;
    subagent: string;
    title?: string;
    background?: boolean;
    summary?: string;
    liveLine?: string;
    error?: string;
    childEvent?: SubagentChildEvent;
  },
): void {
  const emit = getRunEmitter();
  if (!emit) return;
  emit({
    type: "subagent",
    phase,
    taskId: payload.taskId,
    subagent: payload.subagent,
    title: payload.title,
    background: payload.background,
    summary: payload.summary,
    liveLine: payload.liveLine,
    error: payload.error,
    childEvent: payload.childEvent,
  });
}

/** 卡片底栏稳定英文基座：无正文时 Planning，有 reasoning 才带 Thinking 预览。 */
const LIVE_PLANNING = "Planning next moves";
const LIVE_THINKING = "Thinking…";

/** 卡片底栏预览最多保留的字符数（思考尾部 / 回复 / 完成摘要）。 */
const LIVE_LINE_MAX = 40;
const SETTLED_SUMMARY_MAX = 48;

/** 卡片底栏：思考/回复预览（单行）。 */
function formatThinkingLiveLine(buf: string): string {
  const compact = buf.replace(/\s+/g, " ").trim();
  if (!compact) return LIVE_PLANNING;
  const tail = compact.length > LIVE_LINE_MAX ? compact.slice(-LIVE_LINE_MAX) : compact;
  return `${LIVE_THINKING} ${tail}`;
}

/** 子代理工具调用的单行活跃文案（卡片底部）。 */
function formatChildLiveLine(toolName: string, args: ToolArgs): string {
  const name = toolName.trim() || "tool";
  const path = typeof args.path === "string" && args.path.trim() ? args.path.trim() : "";
  const pattern =
    typeof args.pattern === "string" && args.pattern.trim()
      ? args.pattern.trim()
      : typeof args.query === "string" && args.query.trim()
        ? args.query.trim()
        : "";
  const command =
    typeof args.command === "string" && args.command.trim() ? args.command.trim() : "";
  const detail = path || pattern || command;
  if (!detail) return name;
  const clipped = detail.length > 56 ? `${detail.slice(0, 55)}…` : detail;
  return `${name} · ${clipped}`;
}

function formatTaskSnapshot(taskId: string, task: BackgroundTask): string {
  return JSON.stringify({
    taskId,
    subagent: task.subagent,
    status: task.status,
    summary: task.summary || undefined,
    error: task.error || undefined,
    hint:
      task.status === "running"
        ? "Still running; call task_await again (or increase block_until_ms)."
        : undefined,
  });
}

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

/** 从消息历史拼一份止损摘要（触达步数上限时用）。 */
function synthesizePartialSummary(messages: ChatMessage[]): string {
  const parts: string[] = [];
  for (let i = messages.length - 1; i >= 0 && parts.length < 4; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "assistant" && typeof m.content === "string" && m.content.trim()) {
      parts.push(m.content.trim());
    }
  }
  parts.reverse();
  const body = parts.join("\n\n").trim();
  if (body) {
    return `Partial report (step budget reached):\n\n${body.slice(0, 6000)}`;
  }
  return "Step budget reached before a final answer. Retry with a narrower prompt.";
}

/** 隔离子代理一轮（供 Task 工具调用）。 */
export async function runChildAgent(options: {
  systemBody: string;
  prompt: string;
  readonly: boolean;
  signal: AbortSignal;
  taskId: string;
  subagent: string;
  /** 业务标题（追踪树展示）。 */
  title?: string;
  background?: boolean;
  /** 非 inherit 时临时切到指定模型 id。 */
  model?: string;
}): Promise<{ ok: boolean; summary: string }> {
  const modelId = options.model?.trim();
  const needsModelSwitch = Boolean(modelId && modelId.toLowerCase() !== "inherit");
  const title = options.title?.trim() || "";

  const childMode = options.readonly ? "ask" : ("agent" as const);
  const parentCtx = getRunContext();
  /**
   * 派生帧：独立 mode/turn/taskIds，不回写父 ALS。
   * 注意 `usage` **不得**重置：`{...parentCtx}` 浅拷贝共享同一个用量账本引用，
   * 子代理消耗的 token 因此自动并入父 run。误改成新对象会让子代理用量凭空消失。
   */
  const childCtx: RunContext | undefined = parentCtx
    ? {
        ...parentCtx,
        chatMode: childMode,
        turn: undefined,
        taskIds: new Set(),
        hitlIds: new Set(),
        markToolCallStarted: undefined,
      }
    : undefined;

  const withChildFrame = <T>(work: () => Promise<T>): Promise<T> =>
    childCtx ? runWithContext(childCtx, work) : work();

  // ALS 绑定本 Task：并行 background 时各自异步链互不抢栈
  return runWithAgentTaskId(options.taskId, () =>
    withChildFrame(async () => {
      const subSpanId = agentStartSpan({
        name: `subagent:${options.subagent}`,
        runType: "chain",
        taskId: options.taskId,
        summary: title ? `${options.subagent} · ${title}` : `subagent:${options.subagent}`,
        input: {
          prompt: options.prompt,
          readonly: options.readonly,
          background: options.background ?? false,
          model: options.model,
          ...(title ? { title } : {}),
        },
        attrs: {
          taskId: options.taskId,
          subagent: options.subagent,
          background: options.background ?? false,
          ...(title ? { title } : {}),
        },
      });

      const run = async (): Promise<{ ok: boolean; summary: string }> => {
        const parentSelection = needsModelSwitch ? getModelSelection() : null;
        if (needsModelSwitch && modelId) {
          configureModelCatalog(undefined, { mode: "manual", modelId });
        }

        const emitProgress = (liveLine: string, childEvent?: SubagentChildEvent) => {
          // 主会话已 cancel：勿再推 progress，否则 Background 条会被重新加回
          if (options.signal.aborted) return;
          if (options.background) {
            const entry = backgroundTasks.get(options.taskId);
            if (entry && entry.status !== "running") return;
          }
          emitSubagent("progress", {
            taskId: options.taskId,
            subagent: options.subagent,
            background: options.background,
            liveLine,
            childEvent,
          });
        };

        try {
          const messages: ChatMessage[] = [{ role: "user", content: options.prompt }];
          emitProgress("Starting…", { type: "status", status: "planning" });

          // 执行步数预算：每次模型调用与每次工具执行各计 1 步（与主图 superstep 同语义）
          const maxSteps = getLimit("maxSubagentSteps");
          let usedSteps = 0;
          let modelTurn = 0;
          for (;;) {
            if (options.signal.aborted) {
              return { ok: false, summary: "Subagent cancelled." };
            }
            if (usedSteps >= maxSteps) break;
            usedSteps += 1;
            modelTurn += 1;
            const frame = getRunContext();
            if (frame) frame.turn = modelTurn;
            // 尚无 reasoning：planning；有 thinking token 后再升为 Thinking
            emitProgress(LIVE_PLANNING, { type: "status", status: "planning" });

            const assembled = await assembleContext({
              messages,
              aiLocale: getAiLocale(),
              allowEmoji: getAllowEmoji(),
              contextWindow: getContextWindow(),
              workspaceRoot: getWorkspaceRootOrNull(),
              childReadonly: options.readonly,
              allowTask: false,
              chatMode: childMode,
            });
            const efficiency = [
              "## Subagent execution rules",
              "Work efficiently; prefer fewer than 12 tool calls.",
              "Always end with a final text report (no tool call).",
              "If you cannot finish, summarize findings so far instead of more exploration.",
            ].join("\n");
            const systemSections = [
              { id: "subagent", text: options.systemBody },
              { id: "subagentRules", text: efficiency },
              ...assembled.systemSections,
            ];
            const system = joinSystemSections(systemSections);

            let thinkingBuf = "";
            let replyBuf = "";

            const result = await chatWithFailover(
              {
                messages: assembled.messages,
                tools: assembled.tools,
                system,
                systemSections,
                onToken: (text, channel) => {
                  const ch = channel ?? "reply";
                  if (ch === "thinking") {
                    thinkingBuf += text;
                    emitProgress(formatThinkingLiveLine(thinkingBuf), {
                      type: "token",
                      text,
                      channel: "thinking",
                    });
                  } else {
                    replyBuf += text;
                    const compact = replyBuf.replace(/\s+/g, " ").trim();
                    emitProgress(compact.slice(-LIVE_LINE_MAX) || LIVE_PLANNING, {
                      type: "token",
                      text,
                      channel: "reply",
                    });
                  }
                },
              },
              options.signal,
            );

            const assistant: ChatMessage = {
              role: "assistant",
              content: result.content,
              ...(result.toolCalls.length ? { tool_calls: result.toolCalls } : {}),
            };
            messages.push(assistant);
            const calls = result.toolCalls;
            if (!calls.length) {
              const summary = (result.content || "").trim() || "(empty subagent reply)";
              emitProgress(summary.slice(0, SETTLED_SUMMARY_MAX));
              return { ok: true, summary };
            }
            let budgetOut = false;
            for (const call of calls) {
              if (usedSteps >= maxSteps) {
                budgetOut = true;
                break;
              }
              usedSteps += 1;
              const toolName = call.function?.name ?? "";
              const rawArgs = call.function?.arguments ?? "{}";
              let parsed: ToolArgs = {};
              try {
                parsed = JSON.parse(rawArgs) as ToolArgs;
                if (!isRecord(parsed)) parsed = {};
              } catch {
                parsed = {};
              }
              const line = formatChildLiveLine(toolName, parsed);
              const path =
                typeof parsed.path === "string" && parsed.path.trim()
                  ? parsed.path.trim()
                  : undefined;
              const callId = call.id || createId("call");
              const toolSummary = line.includes(" · ")
                ? line.split(" · ").slice(1).join(" · ")
                : undefined;
              emitProgress(line, {
                type: "tool",
                phase: "start",
                name: toolName,
                callId,
                path,
                summary: toolSummary,
              });
              // 显式打 tool:* span（parent = 当前 subagent；runTool 本身不建 span）
              const childToolSpanId = agentStartSpan({
                name: `tool:${toolName || "unknown"}`,
                runType: "tool",
                taskId: options.taskId,
                summary: toolName || "tool",
                input: parsed,
                attrs: {
                  callId,
                  turn: getRunTurn() ?? modelTurn,
                  ...(path ? { path } : {}),
                },
              });
              let tr: Awaited<ReturnType<typeof runTool>>;
              try {
                tr = await runTool(toolName, parsed, options.signal, callId);
                agentEndSpan(childToolSpanId, {
                  status: tr.ok ? "ok" : "error",
                  output: {
                    ok: tr.ok,
                    output: tr.output,
                    ...(tr.ui ? { ui: tr.ui } : {}),
                  },
                  attrs: { callId, turn: getRunTurn() ?? modelTurn },
                });
              } catch (toolErr) {
                const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
                agentEndSpan(childToolSpanId, {
                  status: /cancel/i.test(errMsg) ? "cancelled" : "error",
                  error: errMsg,
                  attrs: { callId, turn: getRunTurn() ?? modelTurn },
                });
                throw toolErr;
              }
              const output = tr.output;
              const ok = tr.ok;
              const ui = tr.ui;
              emitProgress(line, {
                type: "tool",
                phase: "end",
                name: toolName,
                callId,
                path: ui?.path ?? path,
                summary: toolSummary,
                ok,
                diff: ui?.diff,
                sessionId: ui?.sessionId,
                command: ui?.command,
                exitCode: ui?.exitCode,
                backgrounded: ui?.backgrounded,
                restoreContent: ui?.restoreContent,
                resultPaths: ui?.resultPaths,
                resultPathKinds: ui?.resultPathKinds,
              });
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: output,
              });
            }
            if (budgetOut) break;
          }
          const summary = synthesizePartialSummary(messages);
          return { ok: true, summary };
        } finally {
          if (needsModelSwitch && parentSelection) {
            configureModelCatalog(undefined, parentSelection);
          }
        }
      };

      try {
        const result = !needsModelSwitch
          ? await run()
          : await (async () => {
              // 排队切模型，避免两个子代理互相 restore
              let release!: () => void;
              const prev = modelGate;
              modelGate = new Promise<void>((resolve) => {
                release = resolve;
              });
              await prev;
              try {
                return await run();
              } finally {
                release();
              }
            })();
        agentEndSpan(subSpanId, {
          status: result.ok ? "ok" : "error",
          output: { summary: result.summary },
          ...(result.ok ? {} : { error: result.summary }),
        });
        return result;
      } catch (err) {
        agentEndSpan(subSpanId, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }),
  );
}

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
