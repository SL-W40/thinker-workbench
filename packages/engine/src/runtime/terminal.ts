/**
 * 终态事件（done / error）的唯一出口：耗时与用量在此统一结算。
 * - `clock` 为 null 表示 run 未进入执行阶段，耗时未知 → 不带 `durationMs`（UI 展示「—」）；
 * - `ledger` 缺省或一次模型调用都没发生时，用量同样未知 → 不带 `usage`。
 * 两者都遵循同一原则：缺省 = 未知，绝不回填 0 造假。
 */
import type { AgentDoneEvent, AgentErrorEvent, AgentEvent } from "@thinker-workbench/shared";
import type { RunClock } from "./runClock";
import { type RunUsageLedger, settleUsage } from "./usageLedger";

/** 计算终态事件要并入的字段（纯函数，便于单测）。 */
export function terminalExtras(
  now: number,
  clock: RunClock | null,
  ledger?: RunUsageLedger,
): Record<string, unknown> {
  const settled = ledger ? settleUsage(ledger) : undefined;
  const extras: Record<string, unknown> = {};
  if (clock) {
    extras.durationMs = Math.max(0, now - clock.startedAt) + clock.queuedMs;
  }
  if (settled) {
    extras.usage = settled.usage;
    // 只在含粗估时下发：缺省（undefined）即「全部来自官方值」
    if (settled.estimated) extras.usageEstimated = true;
  }
  return extras;
}

export function emitTerminal(
  emit: (event: AgentEvent) => void,
  event:
    | Omit<AgentDoneEvent, "durationMs" | "usage" | "usageEstimated">
    | Omit<AgentErrorEvent, "durationMs" | "usage" | "usageEstimated">,
  clock: RunClock | null,
  ledger?: RunUsageLedger,
): void {
  emit({ ...event, ...terminalExtras(Date.now(), clock, ledger) } as AgentEvent);
}
