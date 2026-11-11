/**
 * 密钥惰性解密：加载 / 公开视图不碰 safeStorage，发消息 / resume / 探测时才解锁。
 * 密文在 provider.apiKeyEnc 上，不另建旁路表。
 */
import type { UnlockModelSecretsResult } from "@thinker-workbench/shared";
import { decryptSecret } from "../secretCrypto";
import { loadSettings } from "./settingsStore";

/** 某 provider 是否仍有未解出的密文。 */
export function hasPendingSecret(providerId: string): boolean {
  const provider = loadSettings().model.providers.find((p) => p.id === providerId);
  return Boolean(provider?.apiKeyEnc.trim()) && !provider?.apiKey.trim();
}

/**
 * 按需解密各 provider 的 `apiKeyEnc` 写入内存明文。
 * 会触发 OS 钥匙串 / Credential 授权（macOS 开发态常见弹窗）。
 * @param force 为 true 时即使已有明文也重新 decrypt（Retry 用，尽量再次触发系统授权框）
 * @returns 是否仍有密文解不开（用户拒绝 / 解密失败）
 */
export function ensureSecretsUnlocked(force = false): { denied: boolean } {
  const current = loadSettings();
  let denied = false;
  for (const provider of current.model.providers) {
    if (!force && provider.apiKey.trim()) continue;
    const enc = provider.apiKeyEnc.trim();
    if (!enc) continue;
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
  const catalog = loadSettings().model;
  return catalog.providers.some((p) => !p.apiKey.trim() && Boolean(p.apiKeyEnc.trim()));
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
