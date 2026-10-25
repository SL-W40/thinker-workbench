/**
 * shell 命令与终端会话：实时输出累积、后台化、退出码回收与会话 id 绑定。
 */
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { LIVE_OUTPUT_CAP } from "./constants";

/**
 * 把终端输出追加到匹配 sessionId 的 shell 工具步（无 sessionId 时挂到当前活动 shell）。
 * 仅保留尾部 LIVE_OUTPUT_CAP 字符。
 */
export function appendShellLiveOutput(
  steps: ChatTimelineStep[],
  chunk: string,
  sessionId?: string,
): ChatTimelineStep[] {
  if (!chunk) return steps;
  let idx = -1;
  if (sessionId) {
    idx = steps.findIndex((s) => s.kind === "tool" && s.sessionId === sessionId);
  }
  if (idx < 0) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      if (
        s.kind === "tool" &&
        (s.name === "shell" || s.name === "shell_await" || s.name === "shell_write") &&
        s.phase === "start" &&
        s.active
      ) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return steps;
  const prev = steps[idx];
  if (prev.kind !== "tool") return steps;
  const merged = `${prev.liveOutput ?? ""}${chunk}`;
  const liveOutput =
    merged.length > LIVE_OUTPUT_CAP ? merged.slice(merged.length - LIVE_OUTPUT_CAP) : merged;
  const copy = [...steps];
  copy[idx] = {
    ...prev,
    sessionId: sessionId ?? prev.sessionId,
    liveOutput,
  };
  return copy;
}

/** 软等待耗尽：按 sessionId 标为 still_running / backgrounded。 */
export function applyShellCommandBackgrounded(
  steps: ChatTimelineStep[],
  sessionId: string,
): ChatTimelineStep[] {
  if (!sessionId) return steps;
  const idx = steps.findIndex((s) => s.kind === "tool" && s.sessionId === sessionId);
  if (idx < 0) return steps;
  const prev = steps[idx];
  if (prev.kind !== "tool") return steps;
  const copy = [...steps];
  copy[idx] = { ...prev, backgrounded: true };
  return copy;
}

/** 命令 finalize：仍挂着的 shell 步收束为 complete（可开终端关掉）。 */
export function applyShellCommandExited(
  steps: ChatTimelineStep[],
  sessionId: string,
  exitCode: number | null,
): ChatTimelineStep[] {
  if (!sessionId) return steps;
  const idx = steps.findIndex((s) => s.kind === "tool" && s.sessionId === sessionId);
  if (idx < 0) return steps;
  const prev = steps[idx];
  if (prev.kind !== "tool") return steps;
  const copy = [...steps];
  copy[idx] = {
    ...prev,
    backgrounded: false,
    exitCode,
    phase: "end",
    active: false,
    ok: prev.ok !== false,
  };
  return copy;
}

/** 终端会话创建时，把 sessionId 绑到当前活动 shell 工具步。 */
export function bindShellSessionId(
  steps: ChatTimelineStep[],
  sessionId: string,
  options?: { runId?: string; command?: string },
): ChatTimelineStep[] {
  if (!sessionId) return steps;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.kind !== "tool") continue;
    if (s.name !== "shell" && s.name !== "shell_await" && s.name !== "shell_write") {
      continue;
    }
    if (s.sessionId && s.sessionId !== sessionId) continue;
    if (s.phase === "start" && s.active) {
      const copy = [...steps];
      copy[i] = {
        ...s,
        sessionId,
        command: options?.command ?? s.command,
      };
      return copy;
    }
  }
  return steps;
}
