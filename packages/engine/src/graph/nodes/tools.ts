/**
 * tools 节点：执行上一轮 agent 留下的 pendingToolCalls，结果写回消息历史。
 */

import { withJsonPreview, withTextPreview } from "@thinker-workbench/logger";
import { agentLog } from "../../log/setup";
import type { ChatMessage, ChatToolCall } from "../../model/types";
import { getRunEmitter } from "../../runtime/runEmit";
import { getRunTurn } from "../../runtime/runContext";
import { agentEndSpan, agentStartSpan } from "../../trace/emit";
import { runTool } from "../../tools/runTool";
import { peekTaskLaunchesInBackground } from "../../tools/task/execute";
import { deriveTaskTitle } from "../../tools/task/title";
import { buildUnifiedDiff } from "../../tools/shared/diff";
import type { ToolArgs } from "../../tools/types";
import type { GraphState } from "../types";

/**
 * 当工具未附带 ui.diff 时，用参数拼一份可见 diff（改文档等大段写入也能在时间线展示）。
 */
function fallbackDiff(name: string, args: ToolArgs): string | undefined {
  const path = typeof args.path === "string" && args.path.trim() ? args.path.trim() : "file";
  if (name === "edit_file") {
    const oldString = typeof args.old_string === "string" ? args.old_string : null;
    const newString = typeof args.new_string === "string" ? args.new_string : null;
    if (oldString == null || newString == null || oldString === newString) return undefined;
    return buildUnifiedDiff(path, oldString, newString);
  }
  if (name === "write_file" && typeof args.contents === "string") {
    return buildUnifiedDiff(path, "", args.contents);
  }
  return undefined;
}

/** 解析模型给出的 arguments 字符串；必须是 JSON 对象。 */
function parseToolArgs(raw: string): { ok: true; args: ToolArgs } | { ok: false; error: string } {
  const trimmed = raw?.trim() || "{}";
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "Tool arguments must be a JSON object." };
    }
    return { ok: true, args: value as ToolArgs };
  } catch {
    return { ok: false, error: `Invalid JSON arguments: ${trimmed.slice(0, 200)}` };
  }
}

/** 从参数抽出 path / 一行摘要（搜索词等）；改文件预览走 diff，不再塞 replace 摘要。 */
function toolUiHints(name: string, args: ToolArgs): { path?: string; summary?: string } {
  const path = typeof args.path === "string" ? args.path : undefined;
  const bits: string[] = [];
  if (typeof args.pattern === "string" && args.pattern) bits.push(args.pattern);
  if (typeof args.query === "string" && args.query) bits.push(args.query);
  if (typeof args.glob === "string" && args.glob) bits.push(args.glob);
  if (
    (name === "read_file" || name === "write_file") &&
    typeof args.start_line === "number" &&
    typeof args.end_line === "number"
  ) {
    bits.push(`L${args.start_line}-L${args.end_line}`);
  }
  if (name === "delete_file" && args.recursive === true) bits.push("recursive");
  if (typeof args.command === "string" && args.command) bits.push(args.command.slice(0, 80));
  const summary = bits.length > 0 ? bits.join(" · ") : undefined;
  return { path, summary };
}

/** 执行单个 tool_call，并发出 tool start/end 事件。 */
async function runOne(call: ChatToolCall, signal: AbortSignal): Promise<ChatMessage> {
  const emit = getRunEmitter();
  const name = call.function.name;
  const callId = call.id;
  const parsed = parseToolArgs(call.function.arguments);
  const hints = parsed.ok ? toolUiHints(name, parsed.args) : {};

  const log = agentLog("graph.tools");
  const commandHint =
    parsed.ok && typeof parsed.args.command === "string" ? parsed.args.command : undefined;
  // Task：用 callId 作 taskId，便于 subagent 挂到本 span，且 par 框住 tool:Task 子树
  const isTaskTool = name === "Task";
  const taskId = isTaskTool ? callId : undefined;
  const taskTitle =
    isTaskTool && parsed.ok
      ? deriveTaskTitle(
          typeof parsed.args.title === "string" ? parsed.args.title : undefined,
          typeof parsed.args.prompt === "string" ? parsed.args.prompt : "",
        )
      : "";
  const taskBackground =
    isTaskTool && parsed.ok ? peekTaskLaunchesInBackground(parsed.args) : false;
  const turn = getRunTurn();
  const toolSpanId = agentStartSpan({
    name: `tool:${name}`,
    kind: "tool",
    taskId,
    summary: isTaskTool && taskTitle ? `Task · ${taskTitle}` : hints.summary || name,
    input: parsed.ok ? parsed.args : { raw: call.function.arguments },
    attrs: {
      callId,
      path: hints.path,
      ...(turn != null ? { turn } : {}),
      ...(isTaskTool
        ? {
            background: taskBackground,
            ...(taskTitle ? { title: taskTitle } : {}),
          }
        : {}),
    },
  });
  emit?.({
    type: "tool",
    phase: "start",
    name,
    callId,
    path: hints.path,
    summary: hints.summary,
    command: commandHint,
  });
  log.info("tool start", {
    spanId: call.id,
    meta: {
      name,
      ...(parsed.ok
        ? withJsonPreview(parsed.args, "args")
        : withTextPreview(call.function.arguments || "", "rawArgs")),
    },
  });
  let content: string;
  if (!parsed.ok) {
    content = `[tool:${name} error]\n${parsed.error}`;
    emit?.({
      type: "tool",
      phase: "end",
      name,
      callId,
      path: hints.path,
      summary: hints.summary,
      detail: "error",
      ok: false,
    });
    log.warn("tool args error", { spanId: call.id, meta: { name, error: parsed.error } });
    agentEndSpan(toolSpanId, { status: "error", error: parsed.error });
  } else {
    try {
      const result = await runTool(name, parsed.args, signal, callId);
      const header = result.ok ? `[tool:${name} ok]` : `[tool:${name} error]`;
      content = `${header}\n${result.output}`;
      const diff =
        (result.ui?.diff && result.ui.diff.length > 0 ? result.ui.diff : undefined) ??
        (result.ok ? fallbackDiff(name, parsed.args) : undefined);
      emit?.({
        type: "tool",
        phase: "end",
        name,
        callId,
        path: result.ui?.path ?? hints.path,
        summary: hints.summary,
        detail: result.ok ? "ok" : "error",
        ok: result.ok,
        diff,
        sessionId: result.ui?.sessionId,
        command: result.ui?.command ?? commandHint,
        exitCode: result.ui?.exitCode,
        backgrounded: result.ui?.backgrounded,
        ...(typeof result.ui?.restoreContent === "string"
          ? { restoreContent: result.ui.restoreContent }
          : {}),
        ...(result.ui?.resultPaths?.length ? { resultPaths: result.ui.resultPaths } : {}),
        ...(result.ui?.resultPathKinds?.length
          ? { resultPathKinds: result.ui.resultPathKinds }
          : {}),
      });
      log.info("tool end", {
        spanId: call.id,
        meta: { name, ok: result.ok, ...withTextPreview(result.output, "output") },
      });
      agentEndSpan(toolSpanId, {
        status: result.ok ? "ok" : "error",
        output: { ok: result.ok, preview: result.output.slice(0, 400) },
        error: result.ok ? undefined : result.output,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      agentEndSpan(toolSpanId, { status: "error", error });
      throw err;
    }
  }

  return {
    role: "tool",
    tool_call_id: call.id,
    content,
  };
}

/**
 * 取出队首连续「后台 Task」批次（≥2 才并行；阻塞型 / 其它工具仍一次一个）。
 * 保持 checkpoint 语义：一批结果一起落盘，Resume 不会半截重跑。
 */
function takeBackgroundTaskBatch(pending: ChatToolCall[]): ChatToolCall[] {
  const batch: ChatToolCall[] = [];
  for (const call of pending) {
    if (call.function.name !== "Task") break;
    const parsed = parseToolArgs(call.function.arguments);
    if (!parsed.ok || !peekTaskLaunchesInBackground(parsed.args)) break;
    batch.push(call);
  }
  return batch.length >= 2 ? batch : [];
}

/**
 * 默认每次只执行一个 pending tool，便于节点结束后落 checkpoint。
 * 例外：连续多个后台 Task 并行启动，避免「先说并行、卡片却一个个冒」。
 */
export async function tools(state: GraphState, signal: AbortSignal): Promise<Partial<GraphState>> {
  if (state.pendingToolCalls.length === 0) {
    return { pendingToolCalls: [] };
  }
  if (signal.aborted) {
    throw new Error("Run cancelled.");
  }

  const batch = takeBackgroundTaskBatch(state.pendingToolCalls);
  if (batch.length >= 2) {
    const log = agentLog("graph.tools");
    log.info("parallel background Task batch", {
      spanId: "tools-batch",
      meta: { count: batch.length, ids: batch.map((c) => c.id) },
    });
    const toolMessages = await Promise.all(batch.map((call) => runOne(call, signal)));
    if (signal.aborted) {
      throw new Error("Run cancelled.");
    }
    return {
      messages: [...state.messages, ...toolMessages],
      pendingToolCalls: state.pendingToolCalls.slice(batch.length),
    };
  }

  const [call, ...rest] = state.pendingToolCalls;
  if (!call) {
    return { pendingToolCalls: [] };
  }
  const toolMessage = await runOne(call, signal);
  if (signal.aborted) {
    throw new Error("Run cancelled.");
  }

  return {
    messages: [...state.messages, toolMessage],
    pendingToolCalls: rest,
  };
}
