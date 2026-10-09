/**
 * 应用设置持久化（固定引导路径 `~/.thinker/settings.json`，不随 dataDir 移动）。
 *
 * 内存中 model.apiKey 为明文；落盘时仅存 `apiKeyEnc`（safeStorage 密文）。
 * 加载时若发现旧版明文 apiKey 会尝试迁移加密。
 */
import fs from "node:fs";
import path from "node:path";
import {
  emptyModelSettings,
  normalizeGeneral,
  normalizeShortcuts,
  THEME_CATALOG_VERSION,
  type GeneralSettings,
  type ModelSettings,
  type ModelSettingsPatch,
  type ModelSettingsPublic,
  type ShortcutsMap,
  toPublicModelSettings,
} from "@thinker-workbench/shared";
import { decryptSecret, encryptSecret } from "./secretCrypto";
import { bootstrapThinkerDir } from "./thinkerHome";

/** 内存中的设置（model.apiKey 为明文）。 */
type StoredSettings = {
  model: ModelSettings;
  shortcuts: ShortcutsMap;
  general: GeneralSettings;
};

/** 磁盘上的 model 段——API Key 仅以密文形式存在。 */
type DiskModel = {
  apiKeyEnc?: string;
  /** @deprecated 旧版明文；加载时迁移后不再写出。 */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  allowEmoji?: boolean;
  contextWindow?: number;
};

/** 磁盘 JSON 根形状。 */
type DiskSettings = {
  /** 主题目录版本；缺省或 `< 2` 时迁移旧 light/dark/mono。 */
  themeCatalogVersion?: number;
  model?: DiskModel;
  shortcuts?: unknown;
  general?: unknown;
};

/** 内存缓存。 */
let cached: StoredSettings | null = null;
/** 最近一次成功写出或加载的密文——后续加密失败时保留，避免丢钥。 */
let lastApiKeyEnc = "";

/** settings.json 绝对路径（始终在引导根 `~/.thinker/`，不随 dataDir 移动）。 */
export function settingsPath(): string {
  return path.join(bootstrapThinkerDir(), "settings.json");
}

/**
 * 从磁盘 model 段还原内存 ModelSettings。
 * @returns needsMigrate 为 true 表示存在旧版明文 apiKey，需加密重写
 */
function readModelFromDisk(raw: unknown): { model: ModelSettings; needsMigrate: boolean } {
  const base = emptyModelSettings();
  if (!raw || typeof raw !== "object") return { model: base, needsMigrate: false };
  const obj = raw as DiskModel;
  const baseUrl = typeof obj.baseUrl === "string" ? obj.baseUrl : "";
  const modelId = typeof obj.model === "string" ? obj.model : "";
  const allowEmoji = typeof obj.allowEmoji === "boolean" ? obj.allowEmoji : false;
  const contextWindow =
    typeof obj.contextWindow === "number" &&
    Number.isFinite(obj.contextWindow) &&
    obj.contextWindow > 0
      ? Math.floor(obj.contextWindow)
      : undefined;

  if (typeof obj.apiKeyEnc === "string" && obj.apiKeyEnc.trim()) {
    lastApiKeyEnc = obj.apiKeyEnc.trim();
    const plain = decryptSecret(lastApiKeyEnc);
    return {
      model: {
        apiKey: plain ?? "",
        baseUrl,
        model: modelId,
        allowEmoji,
        ...(contextWindow != null ? { contextWindow } : {}),
      },
      needsMigrate: false,
    };
  }

  if (typeof obj.apiKey === "string" && obj.apiKey.trim()) {
    return {
      model: {
        apiKey: obj.apiKey.trim(),
        baseUrl,
        model: modelId,
        allowEmoji,
        ...(contextWindow != null ? { contextWindow } : {}),
      },
      needsMigrate: true,
    };
  }

  return {
    model: {
      ...base,
      baseUrl,
      model: modelId,
      allowEmoji,
      ...(contextWindow != null ? { contextWindow } : {}),
    },
    needsMigrate: false,
  };
}

/** 将内存 model 转为磁盘形态（加密 API Key）。 */
function modelToDisk(model: ModelSettings): DiskModel {
  const contextWindow =
    typeof model.contextWindow === "number" &&
    Number.isFinite(model.contextWindow) &&
    model.contextWindow > 0
      ? Math.floor(model.contextWindow)
      : undefined;
  const key = model.apiKey.trim();
  if (!key) {
    lastApiKeyEnc = "";
    return {
      apiKeyEnc: "",
      baseUrl: model.baseUrl,
      model: model.model,
      allowEmoji: model.allowEmoji,
      ...(contextWindow != null ? { contextWindow } : {}),
    };
  }
  const enc = encryptSecret(key);
  if (enc === null) {
    // 加密失败：保留上次密文，绝不写明文
    return {
      apiKeyEnc: lastApiKeyEnc,
      baseUrl: model.baseUrl,
      model: model.model,
      allowEmoji: model.allowEmoji,
      ...(contextWindow != null ? { contextWindow } : {}),
    };
  }
  lastApiKeyEnc = enc;
  return {
    apiKeyEnc: enc,
    baseUrl: model.baseUrl,
    model: model.model,
    allowEmoji: model.allowEmoji,
    ...(contextWindow != null ? { contextWindow } : {}),
  };
}

/** 更新缓存并立即写入磁盘。 */
function persist(next: StoredSettings): void {
  cached = next;
  const file = settingsPath();
  const disk: DiskSettings = {
    themeCatalogVersion: THEME_CATALOG_VERSION,
    model: modelToDisk(next.model),
    shortcuts: next.shortcuts,
    general: next.general,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(disk, null, 2)}\n`, "utf8");
}

/**
 * 加载设置（带缓存）。
 * 若检测到明文 API Key 且加密可用，则迁移后重写文件。
 */
export function loadSettings(): StoredSettings {
  if (cached) return cached;
  const file = settingsPath();
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as DiskSettings;
      const { model, needsMigrate } = readModelFromDisk(parsed.model);
      const catalogVersion =
        typeof parsed.themeCatalogVersion === "number" && Number.isFinite(parsed.themeCatalogVersion)
          ? Math.floor(parsed.themeCatalogVersion)
          : 1;
      const needsThemeMigrate = catalogVersion < THEME_CATALOG_VERSION;
      cached = {
        model,
        shortcuts: normalizeShortcuts(parsed.shortcuts),
        general: normalizeGeneral(parsed.general, catalogVersion),
      };
      if ((needsMigrate && model.apiKey) || needsThemeMigrate) {
        if (needsMigrate && model.apiKey) {
          const enc = encryptSecret(model.apiKey);
          if (enc !== null) {
            persist(cached);
          } else {
            console.error(
              "[settings] plaintext API key present but encryption unavailable; not rewriting",
            );
            if (needsThemeMigrate) persist(cached);
          }
        } else {
          persist(cached);
        }
      }
      return cached;
    }
  } catch (err) {
    console.error("[settings] failed to load", err);
  }
  cached = {
    model: emptyModelSettings(),
    shortcuts: normalizeShortcuts(null),
    general: normalizeGeneral(null),
  };
  return cached;
}

/** 读取完整模型设置（含明文 API Key，仅主进程内使用）。 */
export function getModelSettings(): ModelSettings {
  return loadSettings().model;
}

/** 读取可下发给渲染进程的公开模型设置（不含 API Key）。 */
export function getPublicModelSettings(): ModelSettingsPublic {
  return toPublicModelSettings(getModelSettings());
}

/**
 * 合并 patch 并保存模型设置。
 * 若 patch 含新 API Key 且加密不可用则抛错。
 */
export function saveModelSettings(patch: ModelSettingsPatch): ModelSettingsPublic {
  const current = loadSettings();
  const keyFromPatch =
    typeof patch.apiKey === "string" && patch.apiKey.trim() ? patch.apiKey.trim() : null;
  if (keyFromPatch) {
    const enc = encryptSecret(keyFromPatch);
    if (enc === null) {
      throw new Error("Cannot save API key: OS encryption unavailable.");
    }
  }
  const nextApiKey = keyFromPatch ?? current.model.apiKey;
  const nextContextWindow =
    typeof patch.contextWindow === "number" &&
    Number.isFinite(patch.contextWindow) &&
    patch.contextWindow > 0
      ? Math.floor(patch.contextWindow)
      : current.model.contextWindow;
  const model: ModelSettings = {
    apiKey: nextApiKey,
    baseUrl: typeof patch.baseUrl === "string" ? patch.baseUrl.trim() : current.model.baseUrl,
    model: typeof patch.model === "string" ? patch.model.trim() : current.model.model,
    allowEmoji: typeof patch.allowEmoji === "boolean" ? patch.allowEmoji : current.model.allowEmoji,
    ...(typeof nextContextWindow === "number" ? { contextWindow: nextContextWindow } : {}),
  };
  persist({ ...current, model });
  return toPublicModelSettings(model);
}

/** 读取快捷键映射副本。 */
export function getShortcutsSettings(): ShortcutsMap {
  return { ...loadSettings().shortcuts };
}

/** 合并并保存快捷键映射。 */
export function saveShortcutsSettings(patch: Partial<ShortcutsMap>): ShortcutsMap {
  const current = loadSettings();
  const shortcuts = normalizeShortcuts({ ...current.shortcuts, ...patch });
  persist({ ...current, shortcuts });
  return { ...shortcuts };
}

/** 读取通用设置副本。 */
export function getGeneralSettings(): GeneralSettings {
  return { ...loadSettings().general };
}

/**
 * 合并并保存通用设置。
 * 忽略 `dataDir`：数据目录须走 `commitDataDirSetting` / applyDataDirChange。
 */
export function saveGeneralSettings(patch: Partial<GeneralSettings>): GeneralSettings {
  const current = loadSettings();
  const { dataDir: _ignored, ...rest } = patch ?? {};
  void _ignored;
  const general = normalizeGeneral({ ...current.general, ...rest });
  // 保留已生效的 dataDir，不被 rest 抹掉
  general.dataDir = current.general.dataDir;
  persist({ ...current, general });
  return { ...general };
}

/** 仅提交 dataDir（由迁移/切换流程调用）。 */
export function commitDataDirSetting(dataDir: string): GeneralSettings {
  const current = loadSettings();
  const general = normalizeGeneral({
    ...current.general,
    dataDir: typeof dataDir === "string" ? dataDir.trim() : "",
  });
  persist({ ...current, general });
  return { ...general };
}
