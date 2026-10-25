/**
 * 消息级用量：一次 run 的 token 只有一个真相——引擎在终态事件里下发的 `usage`。
 *
 * 与 `messageClock.ts` 对称：
 * - 终态：以引擎值为准（替换本地直播累加值），并带上是否含粗估的标记；
 * - 引擎没给（本 run 一次模型调用都没发生，如准入即失败）→ 保留本地值（通常也没），
 *   **绝不粗估、绝不补 0**，由 UI 展示「—」。
 */
import type { ChatMessage, ModelUsage } from "@thinker-workbench/shared";

/**
 * 终态写用量。
 * @param usage 引擎下发的累计用量；缺省表示未知。
 * @param estimated 该用量是否含粗估成分（网关未回 usage 或中断补算）。
 */
export function finishMessageUsage(
  message: ChatMessage,
  usage: ModelUsage | undefined,
  estimated = false,
): ChatMessage {
  if (!usage) return message;
  return { ...message, usage, usageEstimated: estimated };
}
