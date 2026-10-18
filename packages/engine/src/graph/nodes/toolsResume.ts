/**
 * Resume 防重放：判断 pending tool 是复用已有结果、注入中断说明，还是正常执行。
 */
import type { ChatMessage, ChatToolCall } from "../../model/types";
import type { GraphState } from "../types";

/** 中断文案分类。 */
export type InterruptToolClass = "shell" | "mutate_file" | "task" | "default";

/** 对单个 pending call 的处置。 */
export type PendingToolAction = "reuse" | "interrupt" | "run";

const SHELL_TOOLS = new Set(["shell", "shell_await", "shell_write"]);
const MUTATE_FILE_TOOLS = new Set(["edit_file", "write_file", "delete_file"]);
const TASK_TOOLS = new Set(["Task", "task_await", "task_cancel"]);

/** 在 messages 中查找已有的同 callId tool 结果。 */
export function findToolResultMessage(
  messages: ChatMessage[],
  callId: string,
): ChatMessage | undefined {
  const id = callId?.trim();
  if (!id) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "tool" && m.tool_call_id === id) return m;
  }
  return undefined;
}

/** 按工具名分类中断说明。 */
export function classifyToolForInterrupt(name: string): InterruptToolClass {
  if (SHELL_TOOLS.has(name)) return "shell";
  if (MUTATE_FILE_TOOLS.has(name)) return "mutate_file";
  if (TASK_TOOLS.has(name)) return "task";
  return "default";
}

/** 已开工列表（兼容旧 checkpoint）。 */
export function startedToolCallIdSet(state: Pick<GraphState, "startedToolCallIds">): Set<string> {
  const list = Array.isArray(state.startedToolCallIds) ? state.startedToolCallIds : [];
  return new Set(list.map((id) => id.trim()).filter(Boolean));
}

/**
 * 决定 pending call：reuse（已有结果）/ interrupt（已开工无结果）/ run。
 */
export function resolvePendingToolAction(
  state: Pick<GraphState, "messages" | "startedToolCallIds">,
  call: ChatToolCall,
): PendingToolAction {
  const callId = call.id?.trim() ?? "";
  if (!callId) return "run";
  if (findToolResultMessage(state.messages, callId)) return "reuse";
  if (startedToolCallIdSet(state).has(callId)) return "interrupt";
  return "run";
}

/** 中断原因：用户取消 vs 进程中断（影响文案，不改变防重放策略）。 */
export type InterruptCause = "cancelled" | "crashed";

/** 分类中断正文（不含 `[tool:name error]` 前缀）。 */
export function interruptedToolBody(name: string, cause: InterruptCause = "crashed"): string {
  const by =
    cause === "cancelled"
      ? "Interrupted by user cancel while this call was running"
      : "Interrupted by process crash while this call was running";
  switch (classifyToolForInterrupt(name)) {
    case "shell":
      return [
        `${by}; the PTY/session was reclaimed and will not continue.`,
        "Do not assume the command finished. If the effect is still needed, verify with read-only checks (files, git status, etc.), then issue a new shell call — do not blindly replay.",
      ].join("\n");
    case "mutate_file":
      return [
        `${by}; the file on disk may be unchanged, updated, or partially updated.`,
        "Read the file (or inspect the path) and continue from the actual contents — do not re-apply the same edit blindly.",
      ].join("\n");
    case "task":
      return [
        `${by}; the subagent may never have started, or may have stopped mid-flight.`,
        "Do not assume the task finished. Check with task_await if you have a taskId, or start a new Task only if the work is still needed — do not claim prior results.",
      ].join("\n");
    default:
      return [
        `${by}; no tool result was saved.`,
        "Re-invoke if you still need the information. If this tool can change external state, verify current state before retrying.",
      ].join("\n");
  }
}

/** 构造注入到 messages 的中断 tool 消息。 */
export function interruptedToolMessage(call: ChatToolCall): ChatMessage {
  const name = call.function.name;
  return {
    role: "tool",
    tool_call_id: call.id,
    content: `[tool:${name} error]\n${interruptedToolBody(name)}`,
  };
}

/** 合并 callId 到 started 列表（去重）。 */
export function appendStartedToolCallId(started: string[] | undefined, callId: string): string[] {
  const id = callId.trim();
  const base = Array.isArray(started) ? [...started] : [];
  if (!id || base.includes(id)) return base;
  base.push(id);
  return base;
}
