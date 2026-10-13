/**
 * Task / task_await 执行：隔离子代理 run（可 await 或后台 + 稍后 await）。
 * 子代理不改全局 ChatMode（避免并行互踩）；只读靠 childReadonly 收紧工具。
 */
import { createId, type SubagentChildEvent } from "@thinker-workbench/shared";
import { getMaxSubagentSteps } from "../../config/runtimeLimits";
import { assembleContext } from "../../context/assembleContext";
import { chatWithFailover, configureModelCatalog, getModelSelection } from "../../model/catalog";
import { getAiLocale, getAllowEmoji, getContextWindow } from "../../model/openai";
import type { ChatMessage } from "../../model/types";
import { getRunContext, setRunTurn } from "../../runtime/runContext";
import { getRunEmitter, getRunIds } from "../../runtime/runEmit";
import { getSubagentDefinition, listSubagentDefinitions } from "../../subagents/registry";
import { agentEndSpan, agentStartSpan, runWithAgentTaskId } from "../../trace/emit";
import { getWorkspaceRootOrNull } from "../../workspace";
import { runTool } from "../runTool";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";
import { deriveTaskTitle } from "./title";

/** task_await 默认等待（与 shell 默认无关）。 */
const DEFAULT_AWAIT_MS = 30_000;
type BgStatus = "running" | "finished" | "failed";

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
};

const backgroundTasks = new Map<string, BackgroundTask>();

/** 串行化子代理临时切模型，避免并行互相覆盖 catalog。 */
let modelGate: Promise<void> = Promise.resolve();

/**
 * @deprecated 全清；并行路径请用 cancelBackgroundTasksByRunId。
 */
export function cancelRunningBackgroundTasks(reason = "Cancelled."): void {
  for (const [taskId, task] of backgroundTasks) {
    cancelOneBackgroundTask(taskId, task, reason);
  }
}

/** 仅取消指定父 run 派生的后台 Task。 */
export function cancelBackgroundTasksByRunId(runId: string, reason = "Cancelled."): void {
  const id = runId?.trim();
  if (!id) return;
  for (const [taskId, task] of backgroundTasks) {
    if (task.parentRunId !== id) continue;
    cancelOneBackgroundTask(taskId, task, reason);
  }
}

function cancelOneBackgroundTask(taskId: string, task: BackgroundTask, reason: string): void {
  if (task.status !== "running") return;
  task.status = "failed";
  task.summary = "";
  task.error = reason;
  emitSubagent("cancelled", {
    taskId,
    subagent: task.subagent,
    background: true,
    error: reason,
    summary: reason,
  });
  task.markSettled();
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

/** 卡片底栏：思考/回复预览（单行）。 */
function formatThinkingLiveLine(buf: string): string {
  const compact = buf.replace(/\s+/g, " ").trim();
  if (!compact) return "Thinking…";
  const tail = compact.length > 96 ? compact.slice(-96) : compact;
  return `Thinking… ${tail}`;
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
  if (latest.status === "failed") {
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
    const m = messages[i]!;
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

  // ALS 绑定本 Task：并行 background 时各自异步链互不抢栈
  return runWithAgentTaskId(options.taskId, async () => {
    const subSpanId = agentStartSpan({
      name: `subagent:${options.subagent}`,
      kind: "subagent",
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
        emitProgress("Starting…", { type: "status", status: "thinking" });

        for (let step = 0; step < getMaxSubagentSteps(); step++) {
          if (options.signal.aborted) {
            return { ok: false, summary: "Subagent cancelled." };
          }
          const childTurn = step + 1;
          setRunTurn(childTurn);
          emitProgress("Thinking…", { type: "status", status: "thinking" });

          const assembled = assembleContext({
            messages,
            aiLocale: getAiLocale(),
            allowEmoji: getAllowEmoji(),
            contextWindow: getContextWindow(),
            workspaceRoot: getWorkspaceRootOrNull(),
            childReadonly: options.readonly,
            allowTask: false,
            chatMode: options.readonly ? "ask" : "agent",
          });
          const efficiency = [
            "## Subagent execution rules",
            "Work efficiently; prefer fewer than 12 tool calls.",
            "Always end with a final text report (no tool call).",
            "If you cannot finish, summarize findings so far instead of more exploration.",
          ].join("\n");
          const system = `${options.systemBody}\n\n${efficiency}\n\n${assembled.system}`;

          let thinkingBuf = "";
          let replyBuf = "";

          const result = await chatWithFailover(
            {
              messages: assembled.messages,
              tools: assembled.tools,
              system,
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
                  emitProgress(compact.slice(-96) || "Thinking…", {
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
            emitProgress(summary.slice(0, 120));
            return { ok: true, summary };
          }
          for (const call of calls) {
            const toolName = call.function?.name ?? "";
            const rawArgs = call.function?.arguments ?? "{}";
            let parsed: ToolArgs = {};
            try {
              parsed = JSON.parse(rawArgs) as ToolArgs;
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
              kind: "tool",
              taskId: options.taskId,
              summary: toolName || "tool",
              input: parsed,
              attrs: {
                callId,
                turn: childTurn,
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
                attrs: { callId, turn: childTurn },
              });
            } catch (toolErr) {
              const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
              agentEndSpan(childToolSpanId, {
                status: /cancel/i.test(errMsg) ? "cancelled" : "error",
                error: errMsg,
                attrs: { callId, turn: childTurn },
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
  });
}

/** 是否后台启动（不阻塞本轮工具返回）。 */
function resolveUseBackground(args: ToolArgs, defIsBackground: boolean): boolean {
  const awaitOpt = parseBool(args.await);
  const backgroundOpt = parseBool(args.background);
  if (awaitOpt === true) return false;
  if (awaitOpt === false) return true;
  if (backgroundOpt === true) return true;
  if (backgroundOpt === false) return false;
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

  // 兼容旧轮询约定；新代码应使用 task_await
  if (name === "status" || prompt.toLowerCase().startsWith("status:")) {
    const taskId = prompt.replace(/^status:\s*/i, "").trim() || "";
    return awaitBackgroundTask(taskId, 0, ctx.signal);
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
    childEvent: { type: "status", status: "thinking" },
  });

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

  if (useBackground) {
    let markSettled = (): void => {};
    const settled = new Promise<void>((resolve) => {
      markSettled = resolve;
    });
    const parentRunId = getRunIds()?.runId ?? "";
    const entry: BackgroundTask = {
      subagent: def.name,
      parentRunId,
      status: "running",
      summary: "",
      settled,
      markSettled,
    };
    backgroundTasks.set(taskId, entry);
    if (parentRunId) getRunContext()?.taskIds.add(taskId);
    void (async () => {
      try {
        const result = await runChildAgent(childOpts);
        // 主会话已 cancelRunningBackgroundTasks 时勿覆盖 cancelled
        if (entry.status !== "running") return;
        entry.status = result.ok ? "finished" : "failed";
        entry.summary = result.summary;
        entry.error = result.ok ? undefined : result.summary;
        emitSubagent(result.ok ? "finished" : "failed", {
          taskId,
          subagent: def.name,
          background: true,
          summary: result.summary,
          error: result.ok ? undefined : result.summary,
        });
      } catch (err) {
        if (entry.status !== "running") return;
        const error = err instanceof Error ? err.message : String(err);
        entry.status = "failed";
        entry.summary = "";
        entry.error = error;
        emitSubagent("failed", {
          taskId,
          subagent: def.name,
          background: true,
          error,
        });
      } finally {
        markSettled();
      }
    })();
    return {
      ok: true,
      output: JSON.stringify({
        taskId,
        status: "running",
        subagent: def.name,
        backgrounded: true,
        hint: `Call task_await with taskId when you need the result (same pattern as shell_await).`,
      }),
      ui: { taskId, backgrounded: true },
    };
  }

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
  const taskId = typeof args.taskId === "string" ? args.taskId.trim() : "";
  const blockUntilMs = parseBlockUntilMs(args.block_until_ms, DEFAULT_AWAIT_MS);
  return awaitBackgroundTask(taskId, blockUntilMs, ctx.signal);
}
