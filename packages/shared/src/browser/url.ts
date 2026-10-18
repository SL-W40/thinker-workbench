/**
 * 内置浏览器 URL 规范化与等价比较（导航去重 / 防 reveal 回环）。
 * 不依赖 DOM / node:url，方便 shared 在无 @types/node 下编译。
 */

export const BROWSER_ABOUT_BLANK = "about:blank";

/** 补全协议；空串 → about:blank。 */
export function normalizeBrowserUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return BROWSER_ABOUT_BLANK;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

type ParsedBrowserUrl = {
  protocol: string;
  host: string;
  pathname: string;
  search: string;
};

/** 轻量解析 http(s) URL；失败返回 null。 */
function parseHttpUrl(raw: string): ParsedBrowserUrl | null {
  const m = raw.match(/^(https?):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/i);
  if (!m) return null;
  const proto = m[1];
  const rawHost = m[2];
  if (!proto || !rawHost) return null;
  const protocol = `${proto.toLowerCase()}:`;
  let host = rawHost.toLowerCase();
  // 去掉默认端口
  if (protocol === "https:" && host.endsWith(":443")) host = host.slice(0, -4);
  if (protocol === "http:" && host.endsWith(":80")) host = host.slice(0, -3);
  let pathname = m[3] && m[3].length > 0 ? m[3] : "/";
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  const search = m[4] ?? "";
  return { protocol, host, pathname, search };
}

/**
 * 判断两 URL 是否视为同一导航目标（忽略末尾 `/`、默认端口、hash）。
 * 解析失败时回退为规范化后的字面相等。
 */
export function browserUrlsEqual(a: string, b: string): boolean {
  const left = normalizeBrowserUrl(a);
  const right = normalizeBrowserUrl(b);
  if (left === right) return true;
  const u1 = parseHttpUrl(left);
  const u2 = parseHttpUrl(right);
  if (!u1 || !u2) return left === right;
  return (
    u1.protocol === u2.protocol &&
    u1.host === u2.host &&
    u1.pathname === u2.pathname &&
    u1.search === u2.search
  );
}
