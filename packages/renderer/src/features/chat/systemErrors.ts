/**
 * 识别可映射到本地化文案 + 跳转动作的系统错误。
 */

/** 钥匙串未授权（有密文但 decrypt 失败）。 */
export function isUnlockDeniedError(text: string): boolean {
  const t = text.trim();
  return t === "MODEL_API_KEY_UNLOCK_DENIED" || t.startsWith("MODEL_API_KEY_UNLOCK_DENIED");
}

/**
 * 尚未配置模型 API key（与 engine `MODEL_API_KEY_MISSING` 对齐）。
 * 不含钥匙串拒绝——那种走自定义门禁，不走气泡内「去设置」链接。
 */
export function isMissingApiKeyError(text: string): boolean {
  const t = text.trim();
  if (isUnlockDeniedError(t)) return false;
  return t === "MODEL_API_KEY_MISSING" || t.startsWith("MODEL_API_KEY_MISSING");
}
