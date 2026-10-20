/**
 * 设置模块内部共享状态：内存缓存与各 provider 密文表。
 * 单独成模块以避免拆分后出现「状态多份真相」。
 */
import type { GeneralSettings, ModelCatalog, ShortcutsMap } from "@thinker-workbench/shared";

/** 内存中的设置（provider.apiKey 为明文）。 */
export type StoredSettings = {
  model: ModelCatalog;
  shortcuts: ShortcutsMap;
  general: GeneralSettings;
};

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

/** 各 provider 最近成功密文，加密失败 / 未解锁时保留。 */
export const lastApiKeyEncByProvider = new Map<string, string>();

export function getCachedSettings(): StoredSettings | null {
  return cached;
}

export function setCachedSettings(next: StoredSettings | null): void {
  cached = next;
}

/** 测试用：清空设置缓存与密文表。 */
export function resetSettingsCacheForTests(): void {
  cached = null;
  lastApiKeyEncByProvider.clear();
}
