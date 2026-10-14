/**
 * utility 退出时回收主进程侧按 run 持有的资源。
 *
 * MCP 子进程随 utility 一起退出；shell PTY / browser 租约在主进程，须显式清理，否则成孤儿。
 */
import { releaseBrowserLease } from "../agent/resourceGovernor";
import { terminalSessionManager } from "../terminal/TerminalSessionManager";

/** 按 runId 杀掉关联 PTY 并释放 browser 租约。 */
export function reclaimRunResources(runIds: Iterable<string>): void {
  for (const raw of runIds) {
    const runId = raw?.trim();
    if (!runId) continue;
    try {
      terminalSessionManager.killByRunId(runId);
    } catch {
      /* 退出路径忽略单 run 失败 */
    }
    try {
      releaseBrowserLease(runId);
    } catch {
      /* ignore */
    }
  }
}
