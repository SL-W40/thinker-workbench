/**
 * 侧栏会话活动时间：按末条消息 `createdAt` 计算。
 */

/** 取消息列表中最大 createdAt；无有效时间戳时回退 fallback。 */
export function activityAtFromMessages(
  messages: Array<{ createdAt?: number }>,
  fallback: number,
): number {
  let max = 0;
  for (const m of messages) {
    if (typeof m.createdAt === "number" && Number.isFinite(m.createdAt) && m.createdAt > max) {
      max = m.createdAt;
    }
  }
  return max > 0 ? max : fallback;
}
