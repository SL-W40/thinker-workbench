/**
 * 链接与图片：裸 URL 自动链接、目标/标题拆分、白名单过滤、以及 `[id]` 引用定义查表。
 *
 * 报告里的行内 LTS 脚注引用也走这里（pushLink 的 footnote 分支）。
 */
import type { InlineNode, LinkDef } from "../../types";
import { decodeEntities } from "../entities";
import { sanitizeImageSrc, sanitizeUrl } from "../url";
import { findClosingParen } from "./scan";
import { pushText } from "./text";

export const URL_RE = /https?:\/\/[^\s<]+[^<>\s.,;:!"')\]。，、；：！？（）【】《》「」『』]/uy;
export const WWW_RE = /www\.[^\s<]+[^<>\s.,;:!"')\]。，、；：！？（）【】《》「」『』]/uy;

export function parseAutolinkBare(s: string, i: number): { node: InlineNode; next: number } | null {
  URL_RE.lastIndex = i;
  const m = URL_RE.exec(s);
  if (m && m.index === i) {
    return { node: { type: "autolink", href: m[0], text: m[0] }, next: i + m[0].length };
  }
  WWW_RE.lastIndex = i;
  const w = WWW_RE.exec(s);
  if (w && w.index === i) {
    return {
      node: { type: "autolink", href: `https://${w[0]}`, text: w[0] },
      next: i + w[0].length,
    };
  }
  return null;
}

export function splitDestTitle(dest: string): [string, string | undefined] {
  const trimmed = dest.trim();
  if (trimmed.startsWith("<")) {
    const end = trimmed.indexOf(">");
    if (end > 0) {
      const href = trimmed.slice(1, end).trim();
      const after = trimmed.slice(end + 1).trim();
      const title = /^(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))$/.exec(after);
      return [href, title ? (title[1] ?? title[2] ?? title[3]) : undefined];
    }
  }
  const matched = /^(\S+?)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?$/.exec(trimmed);
  if (!matched) return [trimmed, undefined];
  return [matched[1] ?? trimmed, matched[2] ?? matched[3] ?? matched[4]];
}

/** 流式缓冲区里，未闭合的 `[...](` 不能再往下扫出自动链接。 */
export function bracketIsComplete(s: string, i: number): boolean {
  const close = s.indexOf("]", i + 1);
  if (close < 0) return false;
  if (s[close + 1] === "(") return findClosingParen(s, close + 1) >= 0;
  if (s[close + 1] === "[") return s.indexOf("]", close + 2) >= 0;
  return true;
}

export function safeHref(raw: string): string | null {
  return sanitizeUrl(decodeEntities(raw));
}

export function pushLink(
  nodes: InlineNode[],
  href: string,
  title: string | undefined,
  children: InlineNode[],
): void {
  const safe = safeHref(href);
  if (!safe) {
    nodes.push(...children);
    return;
  }
  nodes.push({
    type: "link",
    href: safe,
    title: title ? decodeEntities(title) : undefined,
    children,
  });
}

export function pushImage(
  nodes: InlineNode[],
  src: string,
  alt: string,
  title: string | undefined,
): void {
  const safe = sanitizeImageSrc(decodeEntities(src));
  if (!safe) {
    pushText(nodes, alt || src);
    return;
  }
  nodes.push({
    type: "image",
    src: safe,
    alt,
    title: title ? decodeEntities(title) : undefined,
  });
}

export function resolveLinkDef(
  id: string,
  defs: Record<string, LinkDef> | undefined,
): LinkDef | undefined {
  if (!defs) return undefined;
  const key = id.trim().toLowerCase();
  return defs[key] ?? defs[id.trim()];
}
