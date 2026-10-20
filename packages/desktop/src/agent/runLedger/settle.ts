/**
 * 终态结算映射与合成终态事件广播。
 */
import { type AgentEvent, IpcChannels, type SessionRunStatus } from "@thinker-workbench/shared";
import { BrowserWindow } from "electron";
import type { OpenRun, RunOutcome, SettleDetail } from "./types";

/** outcome → 会话 run 状态。 */
export function outcomeToSessionStatus(outcome: RunOutcome): SessionRunStatus {
  switch (outcome) {
    case "done":
      return "idle";
    case "cancelled":
      return "cancelled";
    case "crashed":
      return "crashed";
    case "failed":
      return "failed";
  }
}

/** 无引擎事件时，向渲染进程广播合成终态（done / error）。 */
export function broadcastTerminalEvent(
  entry: OpenRun,
  outcome: RunOutcome,
  detail: SettleDetail,
): void {
  const base = {
    chatSessionId: entry.sessionId,
    threadId: entry.threadId,
    runId: entry.runId,
    ts: Date.now(),
  };
  const event: AgentEvent =
    outcome === "done"
      ? { type: "done", ...base, text: detail.text ?? "" }
      : {
          type: "error",
          ...base,
          error: detail.error ?? outcome,
          code:
            outcome === "cancelled" || outcome === "crashed" || outcome === "failed"
              ? outcome
              : "failed",
        };
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IpcChannels.agentEvent, event);
      }
    }
  } catch {
    /* 测试环境无 Electron 时忽略 */
  }
}
