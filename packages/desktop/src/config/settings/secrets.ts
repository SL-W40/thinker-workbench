/**
 * 密钥惰性解密：加载 / 公开视图不碰 safeStorage，发消息 / resume / 探测时才解锁。
 */
import fs from "node:fs";
import { isRecord, type UnlockModelSecretsResult } from "@thinker-workbench/shared";
import { decryptSecret } from "../secretCrypto";
import { bootstrapSettingsPath, settingsPath } from "./filePaths";
import { loadSettings } from "./settingsStore";
import { type DiskModelCatalog, type DiskSettings, lastApiKeyEncByProvider } from "./state";

/** 某 provider 是否仍有未解锁（或已存）的密文。 */
export function hasPendingSecret(providerId: string): boolean {
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
      if (!isRecord(parsed)) continue;
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
export function ensureSecretsUnlocked(force = false): { denied: boolean } {
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
