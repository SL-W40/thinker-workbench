/**
 * Agent utilityProcess 异常退出后的重启退避策略。
 *
 * 与 Electron fork 解耦，便于单测；startAgentProcess 在 exit 时调用。
 */

/** 首次重启前等待（毫秒）。 */
export const AGENT_RESTART_BASE_MS = 500;
/** 退避上限（毫秒）。 */
export const AGENT_RESTART_MAX_MS = 30_000;

/**
 * 计算第 `attempt` 次重启前的等待时间（attempt 从 0 起：500 → 1000 → … → max）。
 */
export function nextAgentRestartDelayMs(
  attempt: number,
  options?: { baseMs?: number; maxMs?: number },
): number {
  const baseMs = options?.baseMs ?? AGENT_RESTART_BASE_MS;
  const maxMs = options?.maxMs ?? AGENT_RESTART_MAX_MS;
  const exp = Math.max(0, Math.floor(attempt));
  return Math.min(maxMs, baseMs * 2 ** exp);
}

/**
 * 是否应在本次 exit 后安排自动重启。
 * `exitedGeneration !== liveGeneration` 表示已被手动 restart/stop 取代。
 */
export function shouldScheduleAgentRestart(state: {
  stopped: boolean;
  liveGeneration: number;
  exitedGeneration: number;
}): boolean {
  if (state.stopped) return false;
  if (state.exitedGeneration !== state.liveGeneration) return false;
  return true;
}
