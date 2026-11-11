/**
 * 设置模块内部共享状态：内存缓存与各 provider 密文表。
 * 单独成模块以避免拆分后出现「状态多份真相」。
 */
import {
  emptyModelCatalog,
  type GeneralSettings,
  type ModelCatalog,
  type ModelEntry,
  type ModelSelection,
  type ShortcutsMap,
} from "@thinker-workbench/shared";

/**
 * 桌面内存里的凭证。
 * `apiKey` 是解锁后的明文；`apiKeyEnc` 是磁盘密文，和凭证放在一起，落盘时直接读它。
 */
export type StoredProvider = {
  id: string;
  label: string;
  apiKey: string;
  apiKeyEnc: string;
  baseUrl: string;
};

/** 内存中的模型目录。比发给 engine 的 ModelCatalog 多密文字段。 */
export type StoredModelCatalog = {
  providers: StoredProvider[];
  models: ModelEntry[];
  selection: ModelSelection;
  allowEmoji: boolean;
};

/** 内存中的设置。 */
export type StoredSettings = {
  model: StoredModelCatalog;
  shortcuts: ShortcutsMap;
  general: GeneralSettings;
};

/** 空目录，provider 上带空密文，供首次启动。 */
export function emptyStoredCatalog(): StoredModelCatalog {
  const catalog = emptyModelCatalog();
  return {
    ...catalog,
    providers: catalog.providers.map((provider) => ({ ...provider, apiKeyEnc: "" })),
  };
}

/** 去掉密文，得到可以下发给 engine 的目录。 */
export function toRuntimeCatalog(model: StoredModelCatalog): ModelCatalog {
  return {
    providers: model.providers.map(({ id, label, apiKey, baseUrl }) => ({
      id,
      label,
      apiKey,
      baseUrl,
    })),
    models: model.models.map((m) => ({ ...m, tags: [...m.tags] })),
    selection: model.selection,
    allowEmoji: model.allowEmoji,
  };
}

/** 磁盘上的凭证段。 */
export type DiskProvider = {
  id?: string;
  label?: string;
  apiKeyEnc?: string;
  baseUrl?: string;
};

/** 磁盘上的模型条目。 */
export type DiskModelEntry = {
  id?: string;
  providerId?: string;
  model?: string;
  label?: string;
  tags?: unknown;
  priority?: number;
  contextWindow?: number;
  enabled?: boolean;
  health?: string;
  lastError?: string;
  lastCheckedAt?: number;
};

/** 新版磁盘 model 段（目录）。 */
export type DiskModelCatalog = {
  version?: number;
  providers?: DiskProvider[];
  models?: DiskModelEntry[];
  selection?: unknown;
  allowEmoji?: boolean;
};

/** 磁盘 JSON 根形状。 */
export type DiskSettings = {
  model?: DiskModelCatalog;
  shortcuts?: unknown;
  general?: unknown;
};

/** 内存缓存。 */
let cached: StoredSettings | null = null;

export function getCachedSettings(): StoredSettings | null {
  return cached;
}

export function setCachedSettings(next: StoredSettings | null): void {
  cached = next;
}

/** 测试用：清空设置缓存。 */
export function resetSettingsCacheForTests(): void {
  cached = null;
}
