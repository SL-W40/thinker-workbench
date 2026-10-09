/**
 * 基于 Electron `safeStorage` 的密钥加解密。
 *
 * API Key 等敏感字段落盘前须加密；加密不可用时返回 null，调用方不得回退为明文。
 */
import { safeStorage } from "electron";

/** 当前用户会话下 OS 是否可用 `safeStorage` 加密。 */
export function isSecretEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * 加密明文密钥以便落盘。
 * @returns base64 密文；加密不可用或失败时返回 null（调用方不得改存明文）
 */
export function encryptSecret(plain: string): string | null {
  const text = plain.trim();
  if (!text) return "";
  if (!isSecretEncryptionAvailable()) {
    console.error("[settings] safeStorage encryption unavailable; refusing plaintext persist");
    return null;
  }
  try {
    return safeStorage.encryptString(text).toString("base64");
  } catch (err) {
    console.error("[settings] encryptSecret failed", err);
    return null;
  }
}

/**
 * 解密磁盘上的 base64 密文。
 * @returns 明文；空输入返回空串；解密失败返回 null
 */
export function decryptSecret(encoded: string): string | null {
  const raw = encoded.trim();
  if (!raw) return "";
  if (!isSecretEncryptionAvailable()) {
    console.error("[settings] safeStorage decryption unavailable");
    return null;
  }
  try {
    return safeStorage.decryptString(Buffer.from(raw, "base64"));
  } catch (err) {
    console.error("[settings] decryptSecret failed", err);
    return null;
  }
}
