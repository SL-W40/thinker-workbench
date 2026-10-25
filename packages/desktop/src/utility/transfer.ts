/**
 * utilityProcess 消息类型守卫与透传辅助。
 *
 * 仅识别 shared 约定的 `channel: "utility"` 信封；用于过滤子进程杂讯。
 */
import type { UtilityToParent } from "@thinker-workbench/shared";

/**
 * 判断未知值是否为子进程 → 主进程的合法消息（ready / event / log）。
 */
export function isUtilityToParent(value: unknown): value is UtilityToParent {
  if (!value || typeof value !== "object") return false;
  const msg = value as { channel?: unknown; kind?: unknown };
  return (
    msg.channel === "utility" &&
    (msg.kind === "ready" ||
      msg.kind === "event" ||
      msg.kind === "log" ||
      msg.kind === "contextUsageResult" ||
      msg.kind === "checkpointClearResult" ||
      msg.kind === "ptyRequest" ||
      msg.kind === "browserRequest" ||
      msg.kind === "gitRequest" ||
      msg.kind === "hitl" ||
      msg.kind === "mcpStatus" ||
      msg.kind === "span")
  );
}
