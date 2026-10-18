/**
 * 模型目录设置类型与脱敏转换。
 * 完整 `apiKey` 仅留在 main / utility；renderer 只见公开视图。
 */
import type { ChatMode } from "./chatMode";
import type { ThinkerGeneralApi } from "./general";
import type { ShortcutsMap, ThinkerShortcutsApi } from "./shortcuts";

/** 模型能力标签（Auto 路由用）。 */
export type ModelTag = "general" | "coding" | "reasoning" | "fast" | "vision";

/** 全部标签字面量。 */
export const MODEL_TAGS: readonly ModelTag[] = [
  "general",
  "coding",
  "reasoning",
  "fast",
  "vision",
] as const;

/** 运行/探测得到的连通状态（与用户手动 enabled 正交）。 */
export type ModelHealth = "ok" | "error";

/** 凭证（API Key + Base URL）；可绑定多个模型。 */
export type ModelProvider = {
  id: string;
  label: string;
  apiKey: string;
  baseUrl: string;
};

/** 单条模型条目（绑定到某个凭证）。 */
export type ModelEntry = {
  id: string;
  providerId: string;
  /** 发给 API 的模型 id。 */
  model: string;
  /** UI 展示名。 */
  label: string;
  tags: ModelTag[];
  /** 越小越优先。 */
  priority: number;
  contextWindow?: number;
  /** 用户手动开关。 */
  enabled: boolean;
  /** 连通健康；失败后为 error，仅探测成功恢复。 */
  health: ModelHealth;
  lastError?: string;
  lastCheckedAt?: number;
};

/** 当前选用：Auto 或指定模型条目。 */
export type ModelSelection = { mode: "auto" } | { mode: "manual"; modelId: string };

/** 完整模型目录 — 仅主进程 / utility（含明文 apiKey）。 */
export type ModelCatalog = {
  providers: ModelProvider[];
  models: ModelEntry[];
  selection: ModelSelection;
  allowEmoji: boolean;
};

/** 给 renderer 的凭证公开视图。 */
export type ModelProviderPublic = {
  id: string;
  label: string;
  hasApiKey: boolean;
  apiKeyHint: string;
  baseUrl: string;
};

/** 给 renderer 的目录公开视图。 */
export type ModelCatalogPublic = {
  providers: ModelProviderPublic[];
  models: ModelEntry[];
  selection: ModelSelection;
  allowEmoji: boolean;
};

/**
 * 目录补丁。
 * `providers` / `models` 若提供则为全量替换（调用方拼好再写）。
 * 某 provider 的 `apiKey` 省略或空串表示保留已存密钥。
 */
export type ModelCatalogPatch = {
  providers?: Array<{
    id: string;
    label: string;
    apiKey?: string;
    baseUrl: string;
  }>;
  models?: ModelEntry[];
  selection?: ModelSelection;
  allowEmoji?: boolean;
};

/** 连通性测试入参。 */
export type ModelProbeRequest = {
  modelId: string;
};

/** 连通性测试结果。 */
export type ModelProbeResult = {
  ok: boolean;
  error?: string;
  catalog: ModelCatalogPublic;
};

/**
 * 发消息前解锁 OS 加密存储的结果。
 * `denied` = 钥匙串未授权；`missing` = 从未保存过密钥。
 */
export type UnlockModelSecretsResult = { ok: true } | { ok: false; reason: "missing" | "denied" };

/** 解锁请求；`force` 表示 Retry，强制再调一次 decrypt。 */
export type UnlockModelSecretsRequest = {
  force?: boolean;
};

/**
 * 已解析的单模型凭据（engine 实际请求用）。
 * 由目录条目 + 凭证展开得到。
 */
export type ModelSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  allowEmoji: boolean;
  contextWindow?: number;
  /** 来源条目 id（故障切换 / health 回写用）。 */
  entryId?: string;
  /** 来源凭证 id。 */
  providerId?: string;
  /** UI 展示名。 */
  label?: string;
};

/**
 * Preload 暴露的设置 API：快捷键 + 通用设置 + 模型目录读写。
 */
export type ThinkerSettingsApi = ThinkerShortcutsApi &
  ThinkerGeneralApi & {
    /** 读取脱敏后的模型目录。 */
    getModel(): Promise<ModelCatalogPublic>;
    /** 应用目录补丁并返回最新公开视图。 */
    setModel(patch: ModelCatalogPatch): Promise<ModelCatalogPublic>;
    /** 对指定模型做连通性测试。 */
    probeModel(request: ModelProbeRequest): Promise<ModelProbeResult>;
    /** 发消息前解锁已存 API key（会触发 OS 钥匙串）。 */
    unlockModelSecrets(request?: UnlockModelSecretsRequest): Promise<UnlockModelSecretsResult>;
    /** 读取会话级模型选用覆盖（无则 null，继承全局）。 */
    getSessionModelSelection(sessionId: string): Promise<ModelSelection | null>;
    /** 写入会话级模型选用覆盖。 */
    setSessionModelSelection(
      sessionId: string,
      selection: ModelSelection,
    ): Promise<ModelSelection | null>;
    /** 读取会话级 ChatMode（无则 null）。 */
    getSessionChatMode(sessionId: string): Promise<ChatMode | null>;
    /** 写入会话级 ChatMode。 */
    setSessionChatMode(sessionId: string, chatMode: ChatMode): Promise<ChatMode>;
  };

export type { ShortcutsMap };

/** 空目录初值。 */
export function emptyModelCatalog(): ModelCatalog {
  return {
    providers: [],
    models: [],
    selection: { mode: "auto" },
    allowEmoji: false,
  };
}

/** 将密钥转为脱敏 hint。 */
export function apiKeyHint(apiKey: string): string {
  const key = apiKey.trim();
  return key ? `••••${key.slice(-4)}` : "";
}

/** 将完整目录转为公开视图。 */
export function toPublicModelCatalog(catalog: ModelCatalog): ModelCatalogPublic {
  return {
    providers: catalog.providers.map((p) => {
      const key = p.apiKey.trim();
      return {
        id: p.id,
        label: p.label,
        hasApiKey: Boolean(key),
        apiKeyHint: apiKeyHint(key),
        baseUrl: p.baseUrl,
      };
    }),
    models: catalog.models.map((m) => ({ ...m })),
    selection: catalog.selection,
    allowEmoji: catalog.allowEmoji,
  };
}

/** 规范化标签列表（至少 general）。 */
export function normalizeModelTags(tags: unknown): ModelTag[] {
  const allowed = new Set<string>(MODEL_TAGS);
  const list = Array.isArray(tags)
    ? tags.filter((t): t is ModelTag => typeof t === "string" && allowed.has(t))
    : [];
  if (!list.includes("general")) list.unshift("general");
  return [...new Set(list)];
}

/** 规范化 selection。 */
export function normalizeModelSelection(raw: unknown): ModelSelection {
  if (!raw || typeof raw !== "object") return { mode: "auto" };
  const obj = raw as { mode?: unknown; modelId?: unknown };
  if (obj.mode === "manual" && typeof obj.modelId === "string" && obj.modelId.trim()) {
    return { mode: "manual", modelId: obj.modelId.trim() };
  }
  return { mode: "auto" };
}

/** 将条目 + 凭证展开为请求凭据。 */
export function resolveModelSettings(
  catalog: ModelCatalog,
  entry: ModelEntry,
): ModelSettings | null {
  const provider = catalog.providers.find((p) => p.id === entry.providerId);
  if (!provider) return null;
  const apiKey = provider.apiKey.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: provider.baseUrl.trim(),
    model: entry.model.trim(),
    allowEmoji: catalog.allowEmoji,
    ...(typeof entry.contextWindow === "number" &&
    Number.isFinite(entry.contextWindow) &&
    entry.contextWindow > 0
      ? { contextWindow: Math.floor(entry.contextWindow) }
      : {}),
    entryId: entry.id,
    providerId: provider.id,
    label: entry.label || entry.model,
  };
}

/**
 * 启发式任务标签（Auto 路由，无额外 LLM）。
 * @param text 用户本轮文本
 * @param contextPaths `@` 提及的路径
 * @param options.hasImages 本轮或历史含用户附图时优先 vision
 */
export function routeModelTag(
  text: string,
  contextPaths?: string[],
  options?: { hasImages?: boolean },
): ModelTag {
  if (options?.hasImages) return "vision";

  const t = text ?? "";
  const paths = contextPaths ?? [];
  const hasCodeFence = /```/.test(t);
  const hasPathLike =
    paths.length > 0 ||
    /\b[\w.-]+\.(ts|tsx|js|jsx|py|go|rs|java|css|less|json|md|sql)\b/i.test(t) ||
    /[/\\][\w.-]+[/\\]/.test(t);
  if (hasCodeFence || hasPathLike || paths.length >= 2) return "coding";

  if (t.length > 280 || /分析|推理|证明|设计架构|refactor|architecture|prove|reason\b/i.test(t)) {
    return "reasoning";
  }

  const trimmed = t.trim();
  if (trimmed.length > 0 && trimmed.length < 40 && !hasCodeFence && !hasPathLike) {
    return "fast";
  }
  return "general";
}

/**
 * 按 selection 构建候选条目列表（已按 priority 排序）。
 * Auto：仅 enabled && health===ok；手动：指定条目（可含 error）。
 */
export function buildModelCandidates(
  catalog: ModelCatalog,
  selection: ModelSelection,
  options?: { userText?: string; contextPaths?: string[]; hasImages?: boolean },
): ModelEntry[] {
  const byPriority = (a: ModelEntry, b: ModelEntry) =>
    a.priority - b.priority || a.id.localeCompare(b.id);

  if (selection.mode === "manual") {
    const entry = catalog.models.find((m) => m.id === selection.modelId);
    return entry ? [entry] : [];
  }

  const healthy = catalog.models.filter((m) => m.enabled && m.health === "ok");
  if (healthy.length === 0) return [];

  const tag = routeModelTag(options?.userText ?? "", options?.contextPaths, {
    hasImages: options?.hasImages,
  });
  const tagged = healthy.filter((m) => m.tags.includes(tag)).sort(byPriority);
  if (tagged.length > 0) {
    return tagged;
  }
  return [...healthy].sort(byPriority);
}

/** 将失败原因归类为 model_switch reason。 */
export type ModelSwitchReason =
  | "auth"
  | "not_found"
  | "rate_limit"
  | "network"
  | "server"
  | "other";

export function classifyModelSwitchReason(err: unknown): ModelSwitchReason {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/OpenAI HTTP (401|403)\b|unauthorized|forbidden/i.test(msg)) return "auth";
  if (/OpenAI HTTP 404\b|model[_ ]?not[_ ]?found|does not exist/i.test(msg)) return "not_found";
  if (/OpenAI HTTP 429\b|rate.?limit/i.test(msg)) return "rate_limit";
  if (/OpenAI HTTP (502|503|504)\b/i.test(msg)) return "server";
  if (/terminated|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|network|UND_ERR_/i.test(msg)) {
    return "network";
  }
  return "other";
}
