/**
 * 共享资源租约：MCP reload、Browser 单租约。
 * running 会话存在时避免拆掉在途 MCP；Browser 同时只允许一路。
 */
import { countRunningSessions } from "../db/workspacesStore";

/** 是否允许立即对 agent 发起 MCP reload（有 running 则延后）。 */
export function canReloadMcpNow(): boolean {
  return countRunningSessions() === 0;
}

/** Browser 工具租约：同一时刻一个 runId。 */
let browserLeaseRunId: string | null = null;

/** 尝试占用 browser；已被其它 run 占用则失败。 */
export function tryAcquireBrowserLease(runId: string): boolean {
  const id = runId?.trim();
  if (!id) return false;
  if (browserLeaseRunId && browserLeaseRunId !== id) return false;
  browserLeaseRunId = id;
  return true;
}

/** 释放 browser 租约（仅拥有者可释）。 */
export function releaseBrowserLease(runId: string): void {
  const id = runId?.trim();
  if (!id) return;
  if (browserLeaseRunId === id) browserLeaseRunId = null;
}

/** 当前 browser 租约持有者。 */
export function getBrowserLeaseRunId(): string | null {
  return browserLeaseRunId;
}
