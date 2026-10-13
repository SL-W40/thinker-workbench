/**
 * 模型连通性测试：对指定条目发最小 chat/completions 请求。
 * 成功则 health=ok，失败则标 error。
 */
import type { ModelProbeRequest, ModelProbeResult } from "@thinker-workbench/shared";
import { resolveModelSettings } from "@thinker-workbench/shared";
import {
  getModelCatalog,
  getPublicModelSettings,
  markModelHealth,
  unlockModelSecretsForRun,
} from "./settingsStore";

const PROBE_TIMEOUT_MS = 15_000;

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
}

/**
 * 探测单个模型条目的连通性并更新 health。
 * 先解锁钥匙串；未授权 / 未配置时返回稳定错误码，由 renderer 弹统一门禁。
 */
export async function probeModel(request: ModelProbeRequest): Promise<ModelProbeResult> {
  const modelId = typeof request?.modelId === "string" ? request.modelId.trim() : "";
  if (!modelId) {
    return {
      ok: false,
      error: "modelId required",
      catalog: getPublicModelSettings(),
    };
  }

  const unlock = unlockModelSecretsForRun();
  if (!unlock.ok) {
    return {
      ok: false,
      error: unlock.reason === "denied" ? "MODEL_API_KEY_UNLOCK_DENIED" : "MODEL_API_KEY_MISSING",
      catalog: getPublicModelSettings(),
    };
  }

  const catalog = getModelCatalog();
  const entry = catalog.models.find((m) => m.id === modelId);
  if (!entry) {
    return {
      ok: false,
      error: "Model not found",
      catalog: markModelHealth(modelId, "error", "Model not found"),
    };
  }

  const settings = resolveModelSettings(catalog, entry);
  if (!settings?.apiKey) {
    const err = "MODEL_API_KEY_MISSING";
    return { ok: false, error: err, catalog: markModelHealth(modelId, "error", err) };
  }

  const url = `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model || "gpt-4o-mini",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`;
      return { ok: false, error: err, catalog: markModelHealth(modelId, "error", err) };
    }

    return { ok: true, catalog: markModelHealth(modelId, "ok") };
  } catch (e) {
    const err =
      e instanceof Error && e.name === "AbortError"
        ? "Probe timed out"
        : e instanceof Error
          ? e.message
          : String(e);
    return { ok: false, error: err, catalog: markModelHealth(modelId, "error", err) };
  } finally {
    clearTimeout(timer);
  }
}
