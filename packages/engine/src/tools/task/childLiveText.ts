/**
 * 子代理卡片文案：向父 run 透传的活跃事件，以及卡片底栏的单行预览/摘要。
 */
import type { SubagentChildEvent } from "@thinker-workbench/shared";
import { getRunEmitter } from "../../runtime/runEmit";
import { getSubagentDefinition } from "../../subagents/registry";
import type { ToolArgs } from "../types";
import type { BackgroundTask } from "./backgroundRegistry";

export function emitSubagent(
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
export const LIVE_PLANNING = "Planning next moves";
export const LIVE_THINKING = "Thinking…";

/** 卡片底栏预览最多保留的字符数（思考尾部 / 回复 / 完成摘要）。 */
export const LIVE_LINE_MAX = 40;
export const SETTLED_SUMMARY_MAX = 48;

/** 卡片底栏：思考/回复预览（单行）。 */
export function formatThinkingLiveLine(buf: string): string {
  const compact = buf.replace(/\s+/g, " ").trim();
  if (!compact) return LIVE_PLANNING;
  const tail = compact.length > LIVE_LINE_MAX ? compact.slice(-LIVE_LINE_MAX) : compact;
  return `${LIVE_THINKING} ${tail}`;
}

/** 子代理工具调用的单行活跃文案（卡片底部）。 */
export function formatChildLiveLine(toolName: string, args: ToolArgs): string {
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

export function formatTaskSnapshot(taskId: string, task: BackgroundTask): string {
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
