/**
 * 模型目录读取 / 解析 / 保存（快照不解密，完整目录才解锁）。
 */
import {
  apiKeyHint,
  buildModelCandidates,
  createId,
  type ModelCatalog,
  type ModelCatalogPatch,
  type ModelCatalogPublic,
  type ModelEntry,
  type ModelHealth,
  type ModelProvider,
  type ModelSelection,
  type ModelSettings,
  normalizeModelSelection,
  normalizeModelTags,
  resolveModelSettings,
} from "@thinker-workbench/shared";
import { encryptSecret } from "../secretCrypto";
import { hasPendingSecret } from "./secrets";
import { getModelCatalog, getModelCatalogSnapshot, loadSettings, persist } from "./settingsStore";
import { lastApiKeyEncByProvider } from "./state";

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
