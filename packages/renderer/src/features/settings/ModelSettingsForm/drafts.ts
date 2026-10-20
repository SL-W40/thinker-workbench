/**
 * 模型设置表单：草稿类型与纯映射。
 */
import type {
  ModelCatalogPublic,
  ModelEntry,
  ModelSelection,
  ModelTag,
} from "@thinker-workbench/shared";

/** 输入停止后延迟再写入主进程的毫秒数。*/
export const SAVE_DEBOUNCE_MS = 450;

/** 编辑中的凭证（apiKey 仅本地草稿）。*/
export type ProviderDraft = {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey: boolean;
  apiKeyHint: string;
};

export type ProviderForm = {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey: boolean;
  apiKeyHint: string;
  isNew: boolean;
};

export type ModelForm = {
  id: string;
  providerId: string;
  model: string;
  label: string;
  tags: ModelTag[];
  /** 上下文窗口（token）；表单用字符串便于编辑。 */
  contextWindow: string;
  enabled: boolean;
  isNew: boolean;
};

export function toProviderDrafts(catalog: ModelCatalogPublic): ProviderDraft[] {
  return catalog.providers.map((p) => ({
    id: p.id,
    label: p.label,
    baseUrl: p.baseUrl,
    apiKey: "",
    hasApiKey: p.hasApiKey,
    apiKeyHint: p.apiKeyHint,
  }));
}

export function selectionValue(sel: ModelSelection): string {
  return sel.mode === "auto" ? "auto" : sel.modelId;
}

/** 模型表单默认标签：general 兜底 + 显式标签。 */
export function normalizeFormTags(tags: ModelTag[]): ModelTag[] {
  return tags.includes("general") ? tags : (["general", ...tags] as ModelTag[]);
}

/** 上下文窗口解析：非正数 / 非有限数回落默认值。 */
export function parseContextWindow(raw: string, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** 从公开目录重建本地模型草稿（保留本地 health 字段）。 */
export function mergeModelHealth(local: ModelEntry[], incoming: ModelEntry[]): ModelEntry[] {
  return incoming.map((m) => {
    const prev = local.find((x) => x.id === m.id);
    return prev
      ? {
          ...prev,
          health: m.health,
          lastError: m.lastError,
          lastCheckedAt: m.lastCheckedAt,
        }
      : { ...m, tags: [...m.tags] };
  });
}
