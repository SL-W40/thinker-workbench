/**
 * tools 节点：执行上一轮 agent 留下的 pendingToolCalls，结果写回消息历史。
 */

import { withJsonPreview, withTextPreview } from "@thinker-workbench/logger";
import { agentLog } from "../../log/setup";
import type { ChatMessage, ChatToolCall } from "../../model/types";
import { getRunEmitter } from "../../runtime/runEmit";
import { runTool } from "../../tools/runTool";
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
  } else {
    const result = await runTool(name, parsed.args, signal);
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
    });
    log.info("tool end", {
      spanId: call.id,
      meta: { name, ok: result.ok, ...withTextPreview(result.output, "output") },
    });
  }

  return {
    role: "tool",
    tool_call_id: call.id,
    content,
  };
}

/** 按模型给出的顺序串行执行待处理工具调用，结果写回消息历史。 */
export async function tools(state: GraphState, signal: AbortSignal): Promise<Partial<GraphState>> {
  if (state.pendingToolCalls.length === 0) {
    return { pendingToolCalls: [] };
  }

  const toolMessages: ChatMessage[] = [];
  for (const call of state.pendingToolCalls) {
    toolMessages.push(await runOne(call, signal));
  }

  return {
    messages: [...state.messages, ...toolMessages],
    pendingToolCalls: [],
  };
}
