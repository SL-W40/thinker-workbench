/**
 * 会话级聊天姿态（ChatMode）：发消息前选择，随 UtilityRun 下发。
 * 勿与 ModelSelection.mode（auto/manual）混淆。
 */

/** 主会话姿态。 */
export type ChatMode = "agent" | "plan" | "debug" | "ask" | "multitask";

/** 默认姿态。 */
export const DEFAULT_CHAT_MODE: ChatMode = "agent";

/** 全部合法 ChatMode。 */
export const CHAT_MODES: readonly ChatMode[] = [
  "agent",
  "plan",
  "debug",
  "ask",
  "multitask",
] as const;

/** 类型守卫。 */
export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === "string" && (CHAT_MODES as readonly string[]).includes(value);
}

/** 非法值回退默认。 */
export function normalizeChatMode(value: unknown): ChatMode {
  return isChatMode(value) ? value : DEFAULT_CHAT_MODE;
}
