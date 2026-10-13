/**
 * ChatMode：run 内优先读 RunContext；进程级仅作 hello / 无 ALS 默认。
 */
import type { ChatMode } from "@thinker-workbench/shared";
import { DEFAULT_CHAT_MODE, normalizeChatMode } from "@thinker-workbench/shared";
import { getRunContext } from "./runtime/runContext";

let currentChatMode: ChatMode = DEFAULT_CHAT_MODE;

/** 设置进程默认 ChatMode（hello）；run 内应写 RunContext。 */
export function setChatMode(mode: ChatMode | undefined | null): void {
  const normalized = normalizeChatMode(mode ?? DEFAULT_CHAT_MODE);
  const ctx = getRunContext();
  if (ctx) {
    ctx.chatMode = normalized;
    return;
  }
  currentChatMode = normalized;
}

/** 读取当前 ChatMode。 */
export function getChatMode(): ChatMode {
  return getRunContext()?.chatMode ?? currentChatMode;
}

/** 写入类内置工具名。 */
const WRITE_TOOLS = new Set(["write_file", "edit_file", "delete_file"]);
/** Shell 类。 */
const SHELL_TOOLS = new Set(["shell", "shell_await", "shell_write"]);
/** 浏览器类前缀判断用完整集合在 schema 侧。 */
const BROWSER_TOOLS = new Set([
  "browser_navigate",
  "browser_lock",
  "browser_snapshot",
  "browser_click",
  "browser_type",
  "browser_fill",
  "browser_press_key",
  "browser_scroll",
  "browser_evaluate",
  "browser_resize",
  "browser_get_styles",
  "browser_screenshot",
]);

/**
 * 当前模式下是否允许该内置工具。
 * @param childReadonly 子代理只读时再收紧一层
 */
export function isToolAllowedForChatMode(
  toolName: string,
  options?: { childReadonly?: boolean; allowTask?: boolean },
): boolean {
  const mode = currentChatMode;
  const childReadonly = Boolean(options?.childReadonly);
  const allowTask = options?.allowTask !== false;

  if (toolName === "Task" || toolName === "task_await") {
    if (!allowTask) return false;
    if (mode === "ask") return false;
    if (childReadonly) return false;
    return true;
  }

  if (childReadonly || mode === "ask" || mode === "plan") {
    if (WRITE_TOOLS.has(toolName)) return false;
    if (SHELL_TOOLS.has(toolName)) return false;
    if (BROWSER_TOOLS.has(toolName)) return false;
    if (toolName.startsWith("mcp__") && /write|delete|create|update|put|post/i.test(toolName)) {
      return false;
    }
  }

  if (mode === "plan" && BROWSER_TOOLS.has(toolName)) return false;

  return true;
}

/** 拼进 system 的模式附录（英文基座，供模型稳定遵循）。 */
export function buildChatModeAddendum(mode: ChatMode = currentChatMode): string {
  switch (mode) {
    case "plan":
      return [
        "## Chat mode: Plan",
        "Produce a concrete plan: goals, steps, risks, and how to verify.",
        "Do not edit files or run shell/browser tools in this mode.",
        "End by asking whether to switch to Agent mode to implement.",
      ].join("\n");
    case "debug":
      return [
        "## Chat mode: Debug",
        "Reproduce → gather evidence → identify root cause → apply a minimal fix.",
        "Prefer reading logs and failing tests before large edits.",
      ].join("\n");
    case "ask":
      return [
        "## Chat mode: Ask",
        "Answer questions and explain code. Do not modify the repository.",
        "Read-only tools only; never write files or run mutating shell commands.",
      ].join("\n");
    case "multitask":
      return [
        "## Chat mode: Multitask",
        "Prefer splitting independent workstreams via Task with await=false (or background=true).",
        "When you need results, call task_await with each returned taskId (same pattern as shell_await).",
        "You may do other read-only work while tasks run, but do not invent a status subagent and do not claim results until task_await returns finished/failed.",
        "Summarize progress from subagent results for the user.",
      ].join("\n");
    default:
      return [
        "## Chat mode: Agent",
        "Complete the user's request end-to-end using available tools.",
        "For parallel subagents: Task with await=false, then task_await before relying on their output.",
      ].join("\n");
  }
}
