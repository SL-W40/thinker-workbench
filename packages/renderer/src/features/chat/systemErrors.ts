/**
 * 识别可映射到本地化文案 + 跳转动作的系统错误。
 */

/** 与 engine `MODEL_API_KEY_MISSING` 对齐；兼容旧英文整句。 */
export function isMissingApiKeyError(text: string): boolean {
  const t = text.trim();
  return t === "MODEL_API_KEY_MISSING" || /api key is not set/i.test(t);
}
