/**
 * 应用设置持久化（壳）：加载 / 缓存 / 落盘 / 通用与快捷键读写。
 * 路径解析见 ./paths，磁盘映射见 ./diskMappers，密钥解密见 ./secrets，模型目录见 ./modelCatalog。
 *
 * - 权威文件：`<dataDir>/settings.json`（可在数据根；默认 dataDir 即 `~/.thinker`）
 * - 引导镜像：`~/.thinker/settings.json`（dataDir 非默认时同步一份，供下次启动解析 dataDir）
 */
import path from "node:path";
import {
  emptyModelCatalog,
  type GeneralSettings,
  type ModelCatalog,
  normalizeGeneral,
  normalizeShortcuts,
  type ShortcutsMap,
} from "@thinker-workbench/shared";
import { parseDiskFile, toDiskPayload, writeSettingsFile } from "./diskMappers";
import { bootstrapSettingsPath, peekDataDirFromBootstrap, samePath, settingsPath } from "./paths";
import { ensureSecretsUnlocked } from "./secrets";
import { getCachedSettings, type StoredSettings, setCachedSettings } from "./state";

export { resetSettingsCacheForTests } from "./state";

/** 克隆当前目录快照（不强制解锁）。 */
function cloneModelCatalog(model: ModelCatalog): ModelCatalog {
  return {
    providers: model.providers.map((p) => ({ ...p })),
    models: model.models.map((m) => ({ ...m, tags: [...m.tags] })),
    selection: model.selection,
    allowEmoji: model.allowEmoji,
  };
}

/** 更新缓存并写入权威路径；自定义 dataDir 时同步引导镜像。 */
export function persist(next: StoredSettings): void {
  setCachedSettings(next);
  const disk = toDiskPayload(next);
  const primary = settingsPath();
  writeSettingsFile(primary, disk);
  const bootstrap = bootstrapSettingsPath();
  if (!samePath(primary, bootstrap)) {
    writeSettingsFile(bootstrap, disk);
  }
}

/**
 * 加载设置（带缓存）。
 * 优先 `<dataDir>/settings.json`，否则读引导文件并在需要时种到 dataDir。
 */
export function loadSettings(): StoredSettings {
  const cached = getCachedSettings();
  if (cached) return cached;

  const bootstrapFile = bootstrapSettingsPath();
  const dataDir = peekDataDirFromBootstrap();
  const primaryFile = path.join(dataDir, "settings.json");
  const primaryIsBootstrap = samePath(primaryFile, bootstrapFile);

  const primaryParsed = primaryIsBootstrap ? null : parseDiskFile(primaryFile);
  const bootstrapParsed = parseDiskFile(bootstrapFile);
  const chosen = primaryParsed ?? bootstrapParsed;

  if (chosen) {
    setCachedSettings(chosen);
    // 权威文件缺失（只有引导镜像）时种一份到 dataDir
    if (!primaryIsBootstrap && !primaryParsed) {
      persist(chosen);
    }
    return chosen;
  }

  const fresh: StoredSettings = {
    model: emptyModelCatalog(),
    shortcuts: normalizeShortcuts(null),
    general: normalizeGeneral(null),
  };
  setCachedSettings(fresh);
  return fresh;
}

/**
 * 读取模型目录快照；默认不解锁密文（`apiKey` 可能为空）。
 * 启动 hello / 公开视图用此路径，避免一启动就碰钥匙串。
 */
export function getModelCatalogSnapshot(): ModelCatalog {
  return cloneModelCatalog(loadSettings().model);
}

/**
 * 读取完整模型目录（含明文 API Key，仅主进程内使用）。
 * 会按需解锁 OS 加密存储。
 */
export function getModelCatalog(): ModelCatalog {
  ensureSecretsUnlocked();
  return cloneModelCatalog(loadSettings().model);
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
