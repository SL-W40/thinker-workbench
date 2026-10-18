/**
 * 应用设置持久化。
 *
 * - 权威文件：`<dataDir>/settings.json`（可在数据根；默认 dataDir 即 `~/.thinker`）
 * - 引导镜像：`~/.thinker/settings.json`（dataDir 非默认时同步一份，供下次启动解析 dataDir）
 *
 * 内存中 provider.apiKey 为明文；落盘时仅存 `apiKeyEnc`（safeStorage 密文）。
 *
 * 密文**不会**在 `loadSettings` / `getModelCatalogSnapshot` / contextUsage 时解密；
 * 仅在发消息、resume、探测模型等真正需要密钥时经 `ensureSecretsUnlocked` 解锁。
 */
import fs from "node:fs";
import path from "node:path";
import {
  apiKeyHint,
  buildModelCandidates,
  createId,
  emptyModelCatalog,
  type GeneralSettings,
  type ModelCatalog,
  type ModelCatalogPatch,
  type ModelCatalogPublic,
  type ModelEntry,
  type ModelHealth,
  type ModelProvider,
  type ModelSelection,
  type ModelSettings,
  normalizeGeneral,
  normalizeModelSelection,
  normalizeModelTags,
  normalizeShortcuts,
  resolveModelSettings,
  type ShortcutsMap,
  type UnlockModelSecretsResult,
} from "@thinker-workbench/shared";
import { decryptSecret, encryptSecret } from "./secretCrypto";
import { bootstrapThinkerDir, resolveDataDir } from "./thinkerHome";

export type { UnlockModelSecretsResult };

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

/** 磁盘 JSON 根形状。 */
type DiskSettings = {
  model?: DiskModelCatalog;
  shortcuts?: unknown;
  general?: unknown;
};

/** 内存缓存。 */
let cached: StoredSettings | null = null;
/** 各 provider 最近成功密文，加密失败 / 未解锁时保留。 */
const lastApiKeyEncByProvider = new Map<string, string>();

/** 测试用：清空设置缓存与密文表。 */
export function resetSettingsCacheForTests(): void {
  cached = null;
  lastApiKeyEncByProvider.clear();
}

/** 某 provider 是否仍有未解锁（或已存）的密文。 */
function hasPendingSecret(providerId: string): boolean {
  return Boolean(lastApiKeyEncByProvider.get(providerId)?.trim());
}

/**
 * 从权威 / 引导 settings.json 把 `apiKeyEnc` 补回内存表。
 * 防止缓存与 Map 不同步时按需解锁找不到密文（表现为发消息也不弹钥匙串）。
 */
function hydrateEncFromDisk(): void {
  const files = new Set<string>();
  try {
    files.add(settingsPath());
  } catch {
    /* settingsPath 依赖缓存；忽略 */
  }
  try {
    files.add(bootstrapSettingsPath());
  } catch {
    /* ignore */
  }
  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as DiskSettings;
      const rawModel = parsed.model;
      if (!rawModel || typeof rawModel !== "object") continue;
      const providers = (rawModel as DiskModelCatalog).providers;
      if (!Array.isArray(providers)) continue;
      for (const p of providers) {
        if (!p || typeof p !== "object") continue;
        const id = typeof p.id === "string" && p.id.trim() ? p.id.trim() : "";
        const enc = typeof p.apiKeyEnc === "string" ? p.apiKeyEnc.trim() : "";
        if (id && enc) lastApiKeyEncByProvider.set(id, enc);
      }
    } catch (err) {
      console.error("[settings] hydrateEncFromDisk failed", file, err);
    }
  }
}

/**
 * 按需解密各 provider 的 `apiKeyEnc` 写入内存明文。
 * 会触发 OS 钥匙串 / Credential 授权（macOS 开发态常见弹窗）。
 * @param force 为 true 时即使已有明文也重新 decrypt（Retry 用，尽量再次触发系统授权框）
 * @returns 是否仍有密文解不开（用户拒绝 / 解密失败）
 */
function ensureSecretsUnlocked(force = false): { denied: boolean } {
  const current = loadSettings();
  hydrateEncFromDisk();
  let denied = false;
  for (const provider of current.model.providers) {
    if (!force && provider.apiKey.trim()) continue;
    const enc = lastApiKeyEncByProvider.get(provider.id)?.trim();
    if (!enc) continue;
    // force：先清空，避免误以为已解锁而跳过系统交互
    if (force) provider.apiKey = "";
    const plain = decryptSecret(enc);
    if (plain?.trim()) {
      provider.apiKey = plain;
    } else {
      denied = true;
      console.error(
        "[settings] unlock failed for provider",
        provider.id,
        "(keychain denied or decrypt error)",
      );
    }
  }
  return { denied };
}

/** 是否仍有密文尚未解出明文（供 run 前校验）。 */
export function hasLockedModelSecrets(): boolean {
  loadSettings();
  hydrateEncFromDisk();
  return loadSettings().model.providers.some((p) => !p.apiKey.trim() && hasPendingSecret(p.id));
}

/**
 * 发 run / Retry 前解锁已存 API Key（会弹 OS 钥匙串）。
 * 成功才应继续派发；`denied` = 用户未授权；`missing` = 从未保存过密钥。
 *
 * 注意：macOS 若已在本进程点过「拒绝」，系统常**不再弹**密码框，decrypt 会立刻失败；
 * 需完全退出应用后再试。`force: true`（Retry）会强制再调一次 decrypt。
 */
export function unlockModelSecretsForRun(options?: { force?: boolean }): UnlockModelSecretsResult {
  try {
    // 延迟导入避免 settingsStore ↔ electron 循环；仅主进程调用
    const { app } = require("electron") as typeof import("electron");
    if (process.platform === "darwin") {
      try {
        app.focus({ steal: true });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* 非 Electron 测试环境 */
  }

  const { denied } = ensureSecretsUnlocked(Boolean(options?.force));
  const catalog = loadSettings().model;
  if (catalog.providers.some((p) => p.apiKey.trim())) {
    return { ok: true };
  }
  if (denied || hasLockedModelSecrets()) {
    return { ok: false, reason: "denied" };
  }
  return { ok: false, reason: "missing" };
}

/** 克隆当前目录快照（不强制解锁）。 */
function cloneModelCatalog(model: ModelCatalog): ModelCatalog {
  return {
    providers: model.providers.map((p) => ({ ...p })),
    models: model.models.map((m) => ({ ...m, tags: [...m.tags] })),
    selection: model.selection,
    allowEmoji: model.allowEmoji,
  };
}

/** 引导路径上的 settings（始终可写；自定义 dataDir 时作启动镜像）。 */
export function bootstrapSettingsPath(): string {
  return path.join(bootstrapThinkerDir(), "settings.json");
}

function samePath(a: string, b: string): boolean {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === "win32" ? na.toLowerCase() === nb.toLowerCase() : na === nb;
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
  const dataDir = cached ? resolveDataDir(cached.general.dataDir) : peekDataDirFromBootstrap();
  return path.join(dataDir, "settings.json");
}

function readProviderFromDisk(raw: DiskProvider): ModelProvider {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : createId("prov");
  const label = typeof raw.label === "string" ? raw.label : "Provider";
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl : "";

  if (typeof raw.apiKeyEnc === "string" && raw.apiKeyEnc.trim()) {
    const enc = raw.apiKeyEnc.trim();
    lastApiKeyEncByProvider.set(id, enc);
  }
  // 延迟解密：启动只登记密文，真正用钥时再 unlock
  return { id, label, apiKey: "", baseUrl };
}

function readEntryFromDisk(raw: DiskModelEntry, index: number): ModelEntry {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : createId("mdl");
  const providerId =
    typeof raw.providerId === "string" && raw.providerId.trim() ? raw.providerId.trim() : "";
  const model = typeof raw.model === "string" ? raw.model : "";
  const label =
    typeof raw.label === "string" && raw.label.trim() ? raw.label : model || `Model ${index + 1}`;
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
  const lastError =
    typeof raw.lastError === "string" && raw.lastError.trim() ? raw.lastError.trim() : undefined;

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

/** 从磁盘 model 段还原内存 ModelCatalog。 */
function readModelFromDisk(raw: unknown): ModelCatalog {
  if (!raw || typeof raw !== "object") {
    return emptyModelCatalog();
  }
  const obj = raw as DiskModelCatalog;
  const providers: ModelProvider[] = (obj.providers ?? []).map((p) =>
    readProviderFromDisk(p ?? {}),
  );
  const models = (obj.models ?? []).map((e, i) => readEntryFromDisk(e ?? {}, i));
  return {
    providers,
    models,
    selection: normalizeModelSelection(obj.selection),
    allowEmoji: typeof obj.allowEmoji === "boolean" ? obj.allowEmoji : false,
  };
}

function providerToDisk(provider: ModelProvider): DiskProvider {
  const key = provider.apiKey.trim();
  if (!key) {
    // 明文尚未解锁：保留已有密文，避免主题迁移 / 改通用设置时把钥写丢
    const pending = lastApiKeyEncByProvider.get(provider.id)?.trim();
    if (pending) {
      return {
        id: provider.id,
        label: provider.label,
        apiKeyEnc: pending,
        baseUrl: provider.baseUrl,
      };
    }
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
    providers: model.providers.map(providerToDisk),
    models: model.models.map(entryToDisk),
    selection: model.selection,
    allowEmoji: model.allowEmoji,
  };
}

function toDiskPayload(next: StoredSettings): DiskSettings {
  return {
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

function parseDiskFile(file: string): StoredSettings | null {
  try {
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as DiskSettings;
    return {
      model: readModelFromDisk(parsed.model),
      shortcuts: normalizeShortcuts(parsed.shortcuts),
      general: normalizeGeneral(parsed.general),
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
    cached = chosen;
    // 权威文件缺失（只有引导镜像）时种一份到 dataDir
    if (!primaryIsBootstrap && !primaryParsed) {
      persist(cached);
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

/**
 * 从目录解析首个候选的「展示/估算用」模型元数据（不要求已有明文 apiKey）。
 * 用于 contextUsage 等只需要 contextWindow / allowEmoji 的路径。
 */
export function resolvePrimaryModelMeta(
  catalog: ModelCatalog,
  selection?: ModelSelection,
  options?: { userText?: string; contextPaths?: string[] },
): ModelSettings {
  const sel = selection ?? catalog.selection;
  const candidates = buildModelCandidates(catalog, sel, options);
  const first = candidates[0];
  if (!first) {
    return { apiKey: "", baseUrl: "", model: "", allowEmoji: catalog.allowEmoji };
  }
  const provider = catalog.providers.find((p) => p.id === first.providerId);
  return {
    // 故意不填密钥：调用方若需要明文应走 getModelCatalog / unlock
    apiKey: "",
    baseUrl: provider?.baseUrl.trim() ?? "",
    model: first.model.trim(),
    allowEmoji: catalog.allowEmoji,
    ...(typeof first.contextWindow === "number" &&
    Number.isFinite(first.contextWindow) &&
    first.contextWindow > 0
      ? { contextWindow: Math.floor(first.contextWindow) }
      : {}),
    entryId: first.id,
    providerId: first.providerId,
    label: first.label || first.model,
  };
}

/**
 * 按选用解析首个可用 ModelSettings（供简单调用方）。
 * Auto 时取候选首项；无可用则空凭据。**会解锁钥匙串。**
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
  return resolveModelSettings(catalog, first) ?? resolvePrimaryModelMeta(catalog, sel, options);
}

/** 读取可下发给渲染进程的公开模型目录（不解锁密文；有密文时仍标 hasApiKey）。 */
export function getPublicModelSettings(): ModelCatalogPublic {
  const catalog = getModelCatalogSnapshot();
  return {
    providers: catalog.providers.map((p) => {
      const key = p.apiKey.trim();
      const pending = hasPendingSecret(p.id);
      return {
        id: p.id,
        label: p.label,
        hasApiKey: Boolean(key) || pending,
        apiKeyHint: key ? apiKeyHint(key) : pending ? "••••" : "",
        baseUrl: p.baseUrl,
      };
    }),
    models: catalog.models.map((m) => ({ ...m })),
    selection: catalog.selection,
    allowEmoji: catalog.allowEmoji,
  };
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
  return getPublicModelSettings();
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
      const keyFromPatch = typeof p.apiKey === "string" && p.apiKey.trim() ? p.apiKey.trim() : null;
      if (keyFromPatch) {
        const enc = encryptSecret(keyFromPatch);
        if (enc === null) {
          throw new Error("Cannot save API key: OS encryption unavailable.");
        }
      }
      nextProviders.push({
        id,
        label:
          typeof p.label === "string"
            ? p.label.trim() || "Provider"
            : existing?.label || "Provider",
        apiKey: keyFromPatch ?? existing?.apiKey ?? "",
        baseUrl: typeof p.baseUrl === "string" ? p.baseUrl.trim() : (existing?.baseUrl ?? ""),
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
    allowEmoji: typeof patch.allowEmoji === "boolean" ? patch.allowEmoji : current.model.allowEmoji,
  };
  // 已删除的 provider 清掉密文缓存
  const keepIds = new Set(nextProviders.map((p) => p.id));
  for (const id of [...lastApiKeyEncByProvider.keys()]) {
    if (!keepIds.has(id)) lastApiKeyEncByProvider.delete(id);
  }
  persist({ ...current, model });
  return getPublicModelSettings();
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
