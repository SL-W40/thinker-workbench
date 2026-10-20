/**
 * OpenAI 客户端的当前配置与语言偏好（单一状态源）。
 */
import {
  type AiLocale,
  DEFAULT_AI_LOCALE,
  type ModelSettings,
  normalizeAiLocale,
} from "@thinker-workbench/shared";
import type { ChatModel, OpenAIModelOptions } from "../types";

/** 当前生效的模型配置；无 apiKey 时为 null。 */
let configured: OpenAIModelOptions | null = null;
/** 配置变更后需重建的客户端缓存。 */
let cached: ChatModel | null = null;
/** 回复语言偏好（写入 system prompt）。 */
let aiLocale: AiLocale = DEFAULT_AI_LOCALE;
/** 是否允许回复使用 emoji（写入 system prompt；默认禁止）。 */
let allowEmoji = false;
/** 上下文窗口上限；未设置时 assembleContext 用默认 128K。 */
let contextWindow: number | undefined;

/** 应用桌面 Settings 下发的模型配置；会清空已缓存的客户端。 */
export function configureChatModel(settings?: ModelSettings | null): void {
  allowEmoji = settings?.allowEmoji ?? false;
  contextWindow =
    typeof settings?.contextWindow === "number" &&
    Number.isFinite(settings.contextWindow) &&
    settings.contextWindow > 0
      ? Math.floor(settings.contextWindow)
      : undefined;
  const apiKey = settings?.apiKey?.trim() ?? "";
  if (!apiKey) {
    configured = null;
    cached = null;
    return;
  }
  configured = {
    apiKey,
    baseUrl: settings?.baseUrl?.trim() || undefined,
    model: settings?.model?.trim() || undefined,
  };
  cached = null;
}

/** 设置后续补全的优先回复语言。 */
export function configureAiLocale(locale?: AiLocale | null): void {
  aiLocale = normalizeAiLocale(locale, DEFAULT_AI_LOCALE);
}

/** 当前 AI 语言（供 assembleContext）。 */
export function getAiLocale(): AiLocale {
  return aiLocale;
}

/** 当前是否允许 emoji。 */
export function getAllowEmoji(): boolean {
  return allowEmoji;
}

/** 当前上下文窗口；未配置返回 undefined。 */
export function getContextWindow(): number | undefined {
  return contextWindow;
}

/** 当前生效凭据（client 构造 / 缓存判定用）。 */
export function getModelOptions(): OpenAIModelOptions | null {
  return configured;
}

/** 已缓存客户端；无则 null。 */
export function getCachedModel(): ChatModel | null {
  return cached;
}

/** 写入客户端缓存（配置清空时传 null）。 */
export function setCachedModel(next: ChatModel | null): void {
  cached = next;
}
