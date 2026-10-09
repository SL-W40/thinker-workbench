/**
 * 模型设置类型与脱敏转换。
 * 完整 `apiKey` 仅留在 main / utility；renderer 只见 `ModelSettingsPublic`。
 */
import type { ThinkerGeneralApi } from "./general";
import type { ShortcutsMap, ThinkerShortcutsApi } from "./shortcuts";

/** 完整模型设置 — 仅主进程 / utility（切勿把原始 apiKey 发给 renderer）。 */
export type ModelSettings = {
  /** API 密钥原文。 */
  apiKey: string;
  /** API 基址（如 OpenAI 兼容端点）。 */
  baseUrl: string;
  /** 模型名。 */
  model: string;
  /** 是否允许模型回复使用 emoji；关闭时写入 system prompt 约束。 */
  allowEmoji: boolean;
  /**
   * 上下文窗口上限（token）；省略则用 `DEFAULT_CONTEXT_WINDOW`。
   * 供 Context Usage 圆环 / 弹层。
   */
  contextWindow?: number;
};

/** 给 renderer 的公开视图（apiKey 已脱敏）。 */
export type ModelSettingsPublic = {
  /** 是否已配置非空密钥。 */
  hasApiKey: boolean;
  /** 脱敏提示，如 `••••abcd`；无密钥时为空串。 */
  apiKeyHint: string;
  baseUrl: string;
  model: string;
  allowEmoji: boolean;
  contextWindow?: number;
};

/**
 * 来自 renderer 的部分更新。
 * `apiKey` 省略或空串表示保留已存储密钥，不覆盖为清空。
 */
export type ModelSettingsPatch = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  allowEmoji?: boolean;
  contextWindow?: number;
};

/**
 * Preload 暴露的设置 API：快捷键 + 通用设置 + 模型读写。
 * 与 `ThinkerApi.settings` 对应。
 */
export type ThinkerSettingsApi = ThinkerShortcutsApi &
  ThinkerGeneralApi & {
    /** 读取脱敏后的模型设置。 */
    getModel(): Promise<ModelSettingsPublic>;
    /** 应用补丁并返回最新公开视图。 */
    setModel(patch: ModelSettingsPatch): Promise<ModelSettingsPublic>;
  };

export type { ShortcutsMap };

/** 返回全空字段的模型设置初值（默认禁止 emoji）。 */
export function emptyModelSettings(): ModelSettings {
  return { apiKey: "", baseUrl: "", model: "", allowEmoji: false };
}

/**
 * 将完整设置转为公开视图。
 * 有密钥时 `apiKeyHint` 为 `••••` + 末四位；否则为空。
 */
export function toPublicModelSettings(settings: ModelSettings): ModelSettingsPublic {
  const key = settings.apiKey.trim();
  return {
    hasApiKey: Boolean(key),
    apiKeyHint: key ? `••••${key.slice(-4)}` : "",
    baseUrl: settings.baseUrl,
    model: settings.model,
    allowEmoji: settings.allowEmoji,
    ...(typeof settings.contextWindow === "number" &&
    Number.isFinite(settings.contextWindow) &&
    settings.contextWindow > 0
      ? { contextWindow: Math.floor(settings.contextWindow) }
      : {}),
  };
}
