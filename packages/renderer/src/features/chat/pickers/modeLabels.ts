/**
 * ChatMode → 文案键：模式选择器与时间线的模式切换卡片共用，避免两处各写一份。
 */
import type { ChatMode } from "@thinker-workbench/shared";
import type { MessageKey } from "../../../ui/i18n/translate";

/** 模式名（Agent / Plan / …）。 */
export const MODE_LABEL_KEY: Record<ChatMode, MessageKey> = {
  agent: "chat.mode.agent",
  plan: "chat.mode.plan",
  debug: "chat.mode.debug",
  ask: "chat.mode.ask",
  multitask: "chat.mode.multitask",
};
