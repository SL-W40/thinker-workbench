/**
 * 进程内活跃 RunHandle 注册表：cancel / HITL / Task 按 runId 定位。
 */

import type { RunController } from "./RunController";
import type { RunContext } from "./runContext";

export type RunHandle = {
  context: RunContext;
  controller: RunController;
};

const registry = new Map<string, RunHandle>();

/** 登记 Handle。 */
export function registerRun(handle: RunHandle): void {
  registry.set(handle.context.runId, handle);
}

/** 注销 Handle。 */
export function unregisterRun(runId: string): void {
  registry.delete(runId);
}

/** 按 runId 取 Handle。 */
export function getRunHandle(runId: string): RunHandle | undefined {
  return registry.get(runId.trim());
}

/** 当前活跃 run 数量。 */
export function countActiveRuns(): number {
  return registry.size;
}

/** 列出全部活跃 runId。 */
export function listActiveRunIds(): string[] {
  return [...registry.keys()];
}
