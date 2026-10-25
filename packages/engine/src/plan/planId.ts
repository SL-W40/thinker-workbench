/**
 * 会话级活跃计划的稳定 id。
 *
 * created 与 updated 共用同一个 id，保证「一个会话只有一个活跃计划」的语义。
 */
export function planIdForSession(sessionId?: string): string {
  return sessionId ? `plan-${sessionId}` : "plan-local";
}
