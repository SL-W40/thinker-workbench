/**
 * 向当前 run 的 emitter 推送产品事件的便捷封装。
 */
import type { RunEmitter } from "./runEmit";

export function emitToken(
  emit: RunEmitter | undefined | null,
  text: string,
  channel?: "reply" | "thinking",
): void {
  emit?.({ type: "token", text, channel: channel ?? "reply" });
}

export function emitStatus(
  emit: RunEmitter | undefined | null,
  status: "planning" | "thinking",
): void {
  emit?.({ type: "status", status });
}
