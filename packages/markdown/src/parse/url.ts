/**
 * 链接与图片地址白名单。
 * 聊天正文里的 `javascript:` / `data:` / `file:` 不能变成可点击地址。
 */

const SAFE_SCHEME = new Set(["http", "https", "mailto", "tel"]);

function hasControls(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

/** 允许 http(s)、mailto、tel、站内相对路径与锚点；其余方案返回 null。 */
export function sanitizeUrl(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const value = raw.trim();
  if (!value || hasControls(value)) return null;
  if (
    value.startsWith("#") ||
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("?") ||
    value.startsWith("//")
  ) {
    return value;
  }
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value);
  if (!scheme) return value;
  if (!SAFE_SCHEME.has(scheme[1].toLowerCase())) return null;
  return value;
}

/** 图片地址。在链接白名单之外，只放行位图 data URL。 */
export function sanitizeImageSrc(raw: string | undefined | null): string | null {
  const safe = sanitizeUrl(raw);
  if (safe) return safe;
  const value = (raw ?? "").trim();
  if (!value || hasControls(value)) return null;
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,/i.test(value)) return value;
  return null;
}
