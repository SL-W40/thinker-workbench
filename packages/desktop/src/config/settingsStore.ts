/**
 * 应用设置持久化。
 *
 * - 权威文件：`<dataDir>/settings.json`（可在数据根；默认 dataDir 即 `~/.thinker`）
 * - 引导镜像：`~/.thinker/settings.json`（dataDir 非默认时同步一份，供下次启动解析 dataDir）
 *
 * 内存中 provider.apiKey 为明文；落盘时仅存 `apiKeyEnc`（safeStorage 密文）。
 * 加载时若发现旧版单字段 model 或明文 apiKey 会迁移。
 */
import fs from "node:fs";
import path from "node:path";
import {
  createId,
  emptyModelCatalog,
  migrateLegacyModelSettings,
  normalizeGeneral,
  normalizeModelSelection,
  normalizeModelTags,
  normalizeShortcuts,
  THEME_CATALOG_VERSION,
  toPublicModelCatalog,
  type GeneralSettings,
  type ModelCatalog,
  type ModelCatalogPatch,
  type ModelCatalogPublic,
  type ModelEntry,
  type ModelHealth,
  type ModelProvider,
  type ModelSelection,
  type ModelSettings,
  type ShortcutsMap,
  resolveModelSettings,
  buildModelCandidates,
} from "@thinker-workbench/shared";
import { decryptSecret, encryptSecret } from "./secretCrypto";
import { bootstrapThinkerDir, resolveDataDir } from "./thinkerHome";

/** 内存中的设置（provider.apiKey 为明文）。 */
type StoredSettings = {
  model: ModelCatalog;
  shortcuts: ShortcutsMap;
  general: GeneralSettings;
};

/** 磁盘上的凭证段。 */
type DiskProvider = {
  id?: string;
  label?: string;
  apiKeyEnc?: string;
  /** @deprecated 旧版明文。 */
  apiKey?: string;
  baseUrl?: string;
};

/** 磁盘上的模型条目。 */
type DiskModelEntry = {
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
type DiskModelCatalog = {
  version?: number;
  providers?: DiskProvider[];
  models?: DiskModelEntry[];
  selection?: unknown;
  allowEmoji?: boolean;
};

/** 旧版单字段 model 段。 */
type DiskLegacyModel = {
  apiKeyEnc?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  allowEmoji?: boolean;
  contextWindow?: number;
};

/** 磁盘 JSON 根形状。 */
type DiskSettings = {
  themeCatalogVersion?: number;
  model?: DiskModelCatalog | DiskLegacyModel;
  shortcuts?: unknown;
  general?: unknown;
};

/** 内存缓存。 */
let cached: StoredSettings | null = null;
/** 各 provider 最近成功密文，加密失败时保留。 */
const lastApiKeyEncByProvider = new Map<string, string>();

/** 引导路径上的 settings（始终可写；自定义 dataDir 时作启动镜像）。 */
export function bootstrapSettingsPath(): string {
  return path.join(bootstrapThinkerDir(), "settings.json");
}

function samePath(a: string, b: string): boolean {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === "win32"
    ? na.toLowerCase() === nb.toLowerCase()
    : na === nb;
}

/**
 * 数据根 / 权威 settings / 固定引导 settings 的绝对路径一览。
 * @param configured 省略=当前已生效；传入则按该配置串解析（可预览草稿）。
 */
export function describeDataDirPaths(configured?: string): {
  dataDir: string;
  settingsPath: string;
  bootstrapSettingsPath: string;
  sameAsBootstrap: boolean;
} {
  const dataDir =
    configured === undefined
      ? cached
        ? resolveDataDir(cached.general.dataDir)
        : peekDataDirFromBootstrap()
      : resolveDataDir(typeof configured === "string" ? configured : "");
  const settings = path.join(dataDir, "settings.json");
  const bootstrap = bootstrapSettingsPath();
  return {
    dataDir,
    settingsPath: settings,
    bootstrapSettingsPath: bootstrap,
    sameAsBootstrap: samePath(settings, bootstrap),
  };
}

/** 从引导文件窥探 dataDir（加载缓存前用）。 */
function peekDataDirFromBootstrap(): string {
  try {
    const file = bootstrapSettingsPath();
    if (!fs.existsSync(file)) return bootstrapThinkerDir();
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as DiskSettings;
    const raw =
      parsed.general && typeof parsed.general === "object"
        ? (parsed.general as { dataDir?: unknown }).dataDir
        : undefined;
    return resolveDataDir(typeof raw === "string" ? raw : "");
  } catch {
    return bootstrapThinkerDir();
  }
}

/**
 * 权威 settings.json 路径：`<dataDir>/settings.json`。
 * 默认 dataDir 时与引导路径相同。
 */
export function settingsPath(): string {
  const dataDir = cached
    ? resolveDataDir(cached.general.dataDir)
    : peekDataDirFromBootstrap();
  return path.join(dataDir, "settings.json");
}

function isLegacyDiskModel(raw: unknown): raw is DiskLegacyModel {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as DiskModelCatalog & DiskLegacyModel;
  // 新版有 providers 数组或 version>=2
  if (Array.isArray(obj.providers) || (typeof obj.version === "number" && obj.version >= 2)) {
    return false;
  }
  // 旧版有顶层 apiKeyEnc / apiKey / model 字符串
  return (
    typeof obj.apiKeyEnc === "string" ||
    typeof obj.apiKey === "string" ||
    typeof obj.model === "string" ||
    typeof obj.baseUrl === "string"
  );
}

function readProviderFromDisk(raw: DiskProvider): {
  provider: ModelProvider;
  needsMigrate: boolean;
} {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : createId("prov");
  const label = typeof raw.label === "string" ? raw.label : "Provider";
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl : "";

  if (typeof raw.apiKeyEnc === "string" && raw.apiKeyEnc.trim()) {
    const enc = raw.apiKeyEnc.trim();
    lastApiKeyEncByProvider.set(id, enc);
    const plain = decryptSecret(enc);
    return {
      provider: { id, label, apiKey: plain ?? "", baseUrl },
      needsMigrate: false,
    };
  }
  if (typeof raw.apiKey === "string" && raw.apiKey.trim()) {
    return {
      provider: { id, label, apiKey: raw.apiKey.trim(), baseUrl },
      needsMigrate: true,
    };
  }
  return { provider: { id, label, apiKey: "", baseUrl }, needsMigrate: false };
}

function readEntryFromDisk(raw: DiskModelEntry, index: number): ModelEntry {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : createId("mdl");
  const providerId =
    typeof raw.providerId === "string" && raw.providerId.trim()
      ? raw.providerId.trim()
      : "";
  const model = typeof raw.model === "string" ? raw.model : "";
  const label = typeof raw.label === "string" && raw.label.trim() ? raw.label : model || `Model ${index + 1}`;
  const health: ModelHealth = raw.health === "error" ? "error" : "ok";
  const contextWindow =
    typeof raw.contextWindow === "number" &&
    Number.isFinite(raw.contextWindow) &&
    raw.contextWindow > 0
      ? Math.floor(raw.contextWindow)
      : undefined;
  const lastCheckedAt =
    typeof raw.lastCheckedAt === "number" && Number.isFinite(raw.lastCheckedAt)
      ? Math.floor(raw.lastCheckedAt)
      : undefined;
  const lastError = typeof raw.lastError === "string" && raw.lastError.trim()
    ? raw.lastError.trim()
    : undefined;

  return {
    id,
    providerId,
    model,
    label,
    tags: normalizeModelTags(raw.tags),
    priority:
      typeof raw.priority === "number" && Number.isFinite(raw.priority)
        ? Math.floor(raw.priority)
        : index,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    health,
    ...(contextWindow != null ? { contextWindow } : {}),
    ...(lastError ? { lastError } : {}),
    ...(lastCheckedAt != null ? { lastCheckedAt } : {}),
  };
}

/**
 * 从磁盘 model 段还原内存 ModelCatalog。
 * @returns needsMigrate 为 true 表示存在旧版明文 apiKey 或旧单字段结构，需重写
 */
function readModelFromDisk(raw: unknown): { model: ModelCatalog; needsMigrate: boolean } {
  if (!raw || typeof raw !== "object") {
    return { model: emptyModelCatalog(), needsMigrate: false };
  }

  if (isLegacyDiskModel(raw)) {
    const obj = raw as DiskLegacyModel;
    let apiKey = "";
    let needsMigrate = false;
    if (typeof obj.apiKeyEnc === "string" && obj.apiKeyEnc.trim()) {
      const plain = decryptSecret(obj.apiKeyEnc.trim());
      apiKey = plain ?? "";
    } else if (typeof obj.apiKey === "string" && obj.apiKey.trim()) {
      apiKey = obj.apiKey.trim();
      needsMigrate = true;
    } else {
      needsMigrate = true; // 结构迁移
    }
    const catalog = migrateLegacyModelSettings({
      apiKey,
      baseUrl: typeof obj.baseUrl === "string" ? obj.baseUrl : "",
      model: typeof obj.model === "string" ? obj.model : "",
      allowEmoji: typeof obj.allowEmoji === "boolean" ? obj.allowEmoji : false,
      contextWindow:
        typeof obj.contextWindow === "number" && Number.isFinite(obj.contextWindow)
          ? obj.contextWindow
          : undefined,
    });
    // 保留旧密文到新 provider
    if (typeof obj.apiKeyEnc === "string" && obj.apiKeyEnc.trim() && catalog.providers[0]) {
      lastApiKeyEncByProvider.set(catalog.providers[0].id, obj.apiKeyEnc.trim());
    }
    return { model: catalog, needsMigrate: true };
  }

  const obj = raw as DiskModelCatalog;
  let needsMigrate = false;
  const providers: ModelProvider[] = [];
  for (const p of obj.providers ?? []) {
    const { provider, needsMigrate: m } = readProviderFromDisk(p ?? {});
    if (m) needsMigrate = true;
    providers.push(provider);
  }
  const models = (obj.models ?? []).map((e, i) => readEntryFromDisk(e ?? {}, i));
  return {
    model: {
      providers,
      models,
      selection: normalizeModelSelection(obj.selection),
      allowEmoji: typeof obj.allowEmoji === "boolean" ? obj.allowEmoji : false,
    },
    needsMigrate,
  };
}

function providerToDisk(provider: ModelProvider): DiskProvider {
  const key = provider.apiKey.trim();
  if (!key) {
    lastApiKeyEncByProvider.delete(provider.id);
    return {
      id: provider.id,
      label: provider.label,
      apiKeyEnc: "",
      baseUrl: provider.baseUrl,
    };
  }
  const enc = encryptSecret(key);
  if (enc === null) {
    return {
      id: provider.id,
      label: provider.label,
      apiKeyEnc: lastApiKeyEncByProvider.get(provider.id) ?? "",
      baseUrl: provider.baseUrl,
    };
  }
  lastApiKeyEncByProvider.set(provider.id, enc);
  return {
    id: provider.id,
    label: provider.label,
    apiKeyEnc: enc,
    baseUrl: provider.baseUrl,
  };
}

function entryToDisk(entry: ModelEntry): DiskModelEntry {
  return {
    id: entry.id,
    providerId: entry.providerId,
    model: entry.model,
    label: entry.label,
    tags: entry.tags,
    priority: entry.priority,
    enabled: entry.enabled,
    health: entry.health,
    ...(typeof entry.contextWindow === "number" ? { contextWindow: entry.contextWindow } : {}),
    ...(entry.lastError ? { lastError: entry.lastError } : {}),
    ...(typeof entry.lastCheckedAt === "number" ? { lastCheckedAt: entry.lastCheckedAt } : {}),
  };
}

/** 将内存 catalog 转为磁盘形态。 */
function modelToDisk(model: ModelCatalog): DiskModelCatalog {
  return {
    version: 2,
    providers: model.providers.map(providerToDisk),
    models: model.models.map(entryToDisk),
    selection: model.selection,
    allowEmoji: model.allowEmoji,
  };
}

function toDiskPayload(next: StoredSettings): DiskSettings {
  return {
    themeCatalogVersion: THEME_CATALOG_VERSION,
    model: modelToDisk(next.model),
    shortcuts: next.shortcuts,
    general: next.general,
  };
}

function writeSettingsFile(file: string, disk: DiskSettings): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(disk, null, 2)}\n`, "utf8");
}

/** 更新缓存并写入权威路径；自定义 dataDir 时同步引导镜像。 */
function persist(next: StoredSettings): void {
  cached = next;
  const disk = toDiskPayload(next);
  const primary = settingsPath();
  writeSettingsFile(primary, disk);
  const bootstrap = bootstrapSettingsPath();
  if (!samePath(primary, bootstrap)) {
    writeSettingsFile(bootstrap, disk);
  }
}

function parseDiskFile(file: string): {
  settings: StoredSettings;
  needsMigrate: boolean;
  needsThemeMigrate: boolean;
} | null {
  try {
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as DiskSettings;
    const { model, needsMigrate } = readModelFromDisk(parsed.model);
    const catalogVersion =
      typeof parsed.themeCatalogVersion === "number" && Number.isFinite(parsed.themeCatalogVersion)
        ? Math.floor(parsed.themeCatalogVersion)
        : 1;
    const needsThemeMigrate = catalogVersion < THEME_CATALOG_VERSION;
    return {
      settings: {
        model,
        shortcuts: normalizeShortcuts(parsed.shortcuts),
        general: normalizeGeneral(parsed.general, catalogVersion),
      },
      needsMigrate,
      needsThemeMigrate,
    };
  } catch (err) {
    console.error("[settings] failed to load", file, err);
    return null;
  }
}

/**
 * 加载设置（带缓存）。
 * 优先 `<dataDir>/settings.json`，否则读引导文件并在需要时种到 dataDir。
 */
export function loadSettings(): StoredSettings {
  if (cached) return cached;

  const bootstrapFile = bootstrapSettingsPath();
  const dataDir = peekDataDirFromBootstrap();
  const primaryFile = path.join(dataDir, "settings.json");
  const primaryIsBootstrap = samePath(primaryFile, bootstrapFile);

  const primaryParsed = primaryIsBootstrap ? null : parseDiskFile(primaryFile);
  const bootstrapParsed = parseDiskFile(bootstrapFile);
  const chosen = primaryParsed ?? bootstrapParsed;

  if (chosen) {
    cached = chosen.settings;
    const hasAnyKey = chosen.settings.model.providers.some((p) => p.apiKey.trim());
    const needsRewrite =
      chosen.needsMigrate ||
      chosen.needsThemeMigrate ||
      (!primaryIsBootstrap && !primaryParsed);
    if (needsRewrite) {
      if (chosen.needsMigrate && hasAnyKey) {
        // 确认至少一个 key 能加密，否则不强制重写以免丢钥
        const encOk = chosen.settings.model.providers.every((p) => {
          if (!p.apiKey.trim()) return true;
          return encryptSecret(p.apiKey) !== null;
        });
        if (encOk) {
          persist(cached);
        } else {
          console.error(
            "[settings] plaintext API key present but encryption unavailable; not rewriting",
          );
          if (chosen.needsThemeMigrate || (!primaryIsBootstrap && !primaryParsed)) {
            persist(cached);
          }
        }
      } else {
        persist(cached);
      }
    }
    return cached;
  }

  cached = {
    model: emptyModelCatalog(),
    shortcuts: normalizeShortcuts(null),
    general: normalizeGeneral(null),
  };
  return cached;
}

/** 读取完整模型目录（含明文 API Key，仅主进程内使用）。 */
export function getModelCatalog(): ModelCatalog {
  const model = loadSettings().model;
  return {
    providers: model.providers.map((p) => ({ ...p })),
    models: model.models.map((m) => ({ ...m, tags: [...m.tags] })),
    selection: model.selection,
    allowEmoji: model.allowEmoji,
  };
}

/** @deprecated 兼容旧名：返回目录（非单字段）。 */
export function getModelSettings(): ModelCatalog {
  return getModelCatalog();
}

/**
 * 按选用解析首个可用 ModelSettings（供简单调用方）。
 * Auto 时取候选首项；无可用则空凭据。
 */
export function resolvePrimaryModelSettings(
  selection?: ModelSelection,
  options?: { userText?: string; contextPaths?: string[] },
): ModelSettings {
  const catalog = getModelCatalog();
  const sel = selection ?? catalog.selection;
  const candidates = buildModelCandidates(catalog, sel, options);
  const first = candidates[0];
  if (!first) {
    return { apiKey: "", baseUrl: "", model: "", allowEmoji: catalog.allowEmoji };
  }
  return (
    resolveModelSettings(catalog, first) ?? {
      apiKey: "",
      baseUrl: "",
      model: "",
      allowEmoji: catalog.allowEmoji,
    }
  );
}

/** 读取可下发给渲染进程的公开模型目录。 */
export function getPublicModelSettings(): ModelCatalogPublic {
  return toPublicModelCatalog(getModelCatalog());
}

/**
 * 标记模型健康状态并持久化。
 */
export function markModelHealth(
  modelId: string,
  health: ModelHealth,
  error?: string,
): ModelCatalogPublic {
  const current = loadSettings();
  const now = Date.now();
  const models = current.model.models.map((m) => {
    if (m.id !== modelId) return m;
    if (health === "ok") {
      const { lastError: _drop, ...rest } = m;
      void _drop;
      return { ...rest, health: "ok" as const, lastCheckedAt: now };
    }
    return {
      ...m,
      health: "error" as const,
      lastError: (error ?? m.lastError ?? "Unknown error").slice(0, 500),
      lastCheckedAt: now,
    };
  });
  persist({ ...current, model: { ...current.model, models } });
  return toPublicModelCatalog(getModelCatalog());
}

/**
 * 合并 patch 并保存模型目录。
 * 若 patch 含新 API Key 且加密不可用则抛错。
 */
export function saveModelSettings(patch: ModelCatalogPatch): ModelCatalogPublic {
  const current = loadSettings();
  const nextProviders: ModelProvider[] = [];

  if (Array.isArray(patch.providers)) {
    for (const p of patch.providers) {
      const id = typeof p.id === "string" && p.id.trim() ? p.id.trim() : createId("prov");
      const existing = current.model.providers.find((x) => x.id === id);
      const keyFromPatch =
        typeof p.apiKey === "string" && p.apiKey.trim() ? p.apiKey.trim() : null;
      if (keyFromPatch) {
        const enc = encryptSecret(keyFromPatch);
        if (enc === null) {
          throw new Error("Cannot save API key: OS encryption unavailable.");
        }
      }
      nextProviders.push({
        id,
        label: typeof p.label === "string" ? p.label.trim() || "Provider" : existing?.label || "Provider",
        apiKey: keyFromPatch ?? existing?.apiKey ?? "",
        baseUrl: typeof p.baseUrl === "string" ? p.baseUrl.trim() : existing?.baseUrl ?? "",
      });
    }
  } else {
    nextProviders.push(...current.model.providers.map((p) => ({ ...p })));
  }

  const nextModels: ModelEntry[] = Array.isArray(patch.models)
    ? patch.models.map((m, i) => ({
        id: typeof m.id === "string" && m.id.trim() ? m.id.trim() : createId("mdl"),
        providerId: typeof m.providerId === "string" ? m.providerId : "",
        model: typeof m.model === "string" ? m.model.trim() : "",
        label: typeof m.label === "string" ? m.label.trim() : "",
        tags: normalizeModelTags(m.tags),
        priority:
          typeof m.priority === "number" && Number.isFinite(m.priority)
            ? Math.floor(m.priority)
            : i,
        enabled: typeof m.enabled === "boolean" ? m.enabled : true,
        health: m.health === "error" ? "error" : "ok",
        ...(typeof m.contextWindow === "number" &&
        Number.isFinite(m.contextWindow) &&
        m.contextWindow > 0
          ? { contextWindow: Math.floor(m.contextWindow) }
          : {}),
        ...(typeof m.lastError === "string" && m.lastError ? { lastError: m.lastError } : {}),
        ...(typeof m.lastCheckedAt === "number" ? { lastCheckedAt: m.lastCheckedAt } : {}),
      }))
    : current.model.models.map((m) => ({ ...m, tags: [...m.tags] }));

  // 保留未在 patch.models 中出现的 health 字段：上面已从 patch 带入；若调用方未传 health 则用现有
  if (Array.isArray(patch.models)) {
    for (let i = 0; i < nextModels.length; i++) {
      const src = patch.models[i];
      const prev = current.model.models.find((m) => m.id === nextModels[i].id);
      if (src && prev && src.health == null) {
        nextModels[i] = {
          ...nextModels[i],
          health: prev.health,
          ...(prev.lastError ? { lastError: prev.lastError } : {}),
          ...(prev.lastCheckedAt != null ? { lastCheckedAt: prev.lastCheckedAt } : {}),
        };
      }
    }
  }

  let selection = patch.selection
    ? normalizeModelSelection(patch.selection)
    : current.model.selection;
  if (selection.mode === "manual") {
    const manualId = selection.modelId;
    if (!nextModels.some((m) => m.id === manualId)) {
      selection = { mode: "auto" };
    }
  }

  const model: ModelCatalog = {
    providers: nextProviders,
    models: nextModels,
    selection,
    allowEmoji:
      typeof patch.allowEmoji === "boolean" ? patch.allowEmoji : current.model.allowEmoji,
  };
  persist({ ...current, model });
  return toPublicModelCatalog(model);
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
