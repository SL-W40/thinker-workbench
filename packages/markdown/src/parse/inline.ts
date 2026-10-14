/**
 * 行内 Markdown 解析（转义、强调、链接、数学、自动链接等）。
 */
import type { InlineNode, LinkDef } from "../types";
import { decodeEntities } from "./entities";
import type { ParseOptions } from "./options";
import { sanitizeImageSrc, sanitizeUrl } from "./url";

/** CommonMark 可转义 ASCII 标点。 */
const ESCAPABLE = new Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~");

function isWordChar(ch: string | undefined): boolean {
  return Boolean(ch && /[A-Za-z0-9\u00C0-\u024F\u4e00-\u9fff]/.test(ch));
}

/**
 * 是否可作为强调开标记。
 * `_` 遵守 CommonMark：词内（两侧皆 word）不开。
 */
function canOpenEmphasis(s: string, i: number, marker: "*" | "_", run: number): boolean {
  const after = s[i + run];
  if (after === undefined || after === " " || after === "\t" || after === "\n") return false;
  if (marker === "_") {
    const before = i > 0 ? s[i - 1] : undefined;
    if (isWordChar(before) && isWordChar(after)) return false;
  }
  return true;
}

/** 扫描配对 `)`，支持目标 URL 内嵌套括号（如 `http://a.com/x(y)`）。 */
function findClosingParen(s: string, openIndex: number): number {
  if (s[openIndex] !== "(") return -1;
  let depth = 0;
  for (let j = openIndex; j < s.length; j += 1) {
    if (s[j] === "\\" && j + 1 < s.length) {
      j += 1;
      continue;
    }
    if (s[j] === "(") depth += 1;
    else if (s[j] === ")") {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return -1;
}

function parseEmphasisChunk(
  s: string,
  i: number,
  marker: "*" | "_",
  double: boolean,
  streaming: boolean,
  options: ParseOptions,
): { nodes: InlineNode[]; next: number } | null {
  const runWanted = double ? 2 : 1;
  let run = 0;
  while (s[i + run] === marker) run += 1;
  if (run < runWanted) return null;
  if (!canOpenEmphasis(s, i, marker, runWanted)) return null;

  // ***foo*** → strong(emphasis(foo))
  if (run >= 3 && !double) {
    const triple = marker.repeat(3);
    const close3 = s.indexOf(triple, i + 3);
    if (close3 > i) {
      const inner = s.slice(i + 3, close3);
      if (inner) {
        const children = parseInline(inner, options);
        return {
          nodes: [{ type: "strong", children: [{ type: "emphasis", children }] }],
          next: close3 + 3,
        };
      }
    }
  }

  const token = marker.repeat(runWanted);
  if (!s.startsWith(token, i)) return null;
  const close = s.indexOf(token, i + token.length);
  if (close < 0) {
    if (streaming) return null;
    return null;
  }
  const inner = s.slice(i + token.length, close);
  if (!inner) return null;
  const children = parseInline(inner, options);
  const node: InlineNode = double ? { type: "strong", children } : { type: "emphasis", children };
  return { nodes: [node], next: close + token.length };
}

/** 配对标记（== ~~ ~ ^），流式未闭合返回 null。 */
function parseWrapped(
  s: string,
  i: number,
  open: string,
  close: string,
  type: "mark" | "strike" | "sub" | "sup",
  options: ParseOptions,
): { node: InlineNode; next: number } | null {
  if (!s.startsWith(open, i)) return null;
  const end = s.indexOf(close, i + open.length);
  if (end < 0) return null;
  const inner = s.slice(i + open.length, end);
  if (!inner && (type === "sub" || type === "sup")) return null;
  if (!inner && type !== "strike" && type !== "mark") return null;
  // strike/mark 允许空内容时仍跳过空
  if (!inner) return null;
  const children = parseInline(inner, options);
  return { node: { type, children }, next: end + close.length };
}

/** 白名单行内 HTML。 */
function parseHtmlInline(
  s: string,
  i: number,
  options: ParseOptions,
): { node: InlineNode; next: number } | null {
  if (s[i] !== "<") return null;

  if (/^<br\s*\/?>/i.test(s.slice(i))) {
    const m = /^<br\s*\/?>/i.exec(s.slice(i))!;
    return { node: { type: "break" }, next: i + m[0].length };
  }

  const paired = /^<(u|mark|sub|sup|kbd)(\s[^>]*)?>([\s\S]*?)<\/\1\s*>/i.exec(s.slice(i));
  if (!paired) return null;
  const tag = paired[1].toLowerCase();
  const inner = paired[3];
  const next = i + paired[0].length;
  if (tag === "kbd") {
    return { node: { type: "kbd", value: inner }, next };
  }
  if (tag === "u") {
    return { node: { type: "underline", children: parseInline(inner, options) }, next };
  }
  if (tag === "mark") {
    return { node: { type: "mark", children: parseInline(inner, options) }, next };
  }
  if (tag === "sub") {
    return { node: { type: "sub", children: parseInline(inner, options) }, next };
  }
  if (tag === "sup") {
    return { node: { type: "sup", children: parseInline(inner, options) }, next };
  }
  return null;
}

/** 行内 $...$ / $$...$$；流式未闭合返回 null（调用方当文本）。 */
function parseMathInline(
  s: string,
  i: number,
  streaming: boolean,
): { node: InlineNode; next: number } | null {
  if (s[i] !== "$") return null;

  // 块式 $$ 在块级处理；行内若出现 $$...$$ 也支持
  if (s.startsWith("$$", i)) {
    const end = s.indexOf("$$", i + 2);
    if (end < 0) return streaming ? null : null;
    const value = s.slice(i + 2, end);
    if (!value.trim()) return null;
    return { node: { type: "math", value }, next: end + 2 };
  }

  // 货币启发：`$5` 后非空白且无闭合 → 不当数学
  const after = s[i + 1];
  if (!after || after === " " || after === "\t" || after === "\n") return null;

  let j = i + 1;
  while (j < s.length) {
    if (s[j] === "\\" && j + 1 < s.length) {
      j += 2;
      continue;
    }
    if (s[j] === "$") break;
    if (s[j] === "\n") return null;
    j += 1;
  }
  if (j >= s.length || s[j] !== "$") return streaming ? null : null;
  const value = s.slice(i + 1, j);
  if (!value.trim()) return null;
  // 闭合 $ 前一字符不能是空白（避免 `$ x $` 误判仍允许；货币 `$5` 已在上面挡开）
  const beforeClose = s[j - 1];
  if (beforeClose === " " || beforeClose === "\t") return null;
  return { node: { type: "math", value }, next: j + 1 };
}

/** 结尾不能是 ASCII 或中文标点，避免「https://example.com。」把句号吃进链接。 */
const URL_RE = /https?:\/\/[^\s<]+[^<>\s.,;:!"')\]。，、；：！？（）【】《》「」『』]/yu;
const WWW_RE = /www\.[^\s<]+[^<>\s.,;:!"')\]。，、；：！？（）【】《》「」『』]/yu;

function parseAutolinkBare(s: string, i: number): { node: InlineNode; next: number } | null {
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

function splitDestTitle(dest: string): [string, string | undefined] {
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

function pushText(nodes: InlineNode[], value: string): void {
  if (!value) return;
  const decoded = decodeEntities(value);
  const prev = nodes[nodes.length - 1];
  if (prev?.type === "text") prev.value += decoded;
  else nodes.push({ type: "text", value: decoded });
}

/** 流式缓冲区里，未闭合的 `[...](` 不能再往下扫出自动链接。 */
function bracketIsComplete(s: string, i: number): boolean {
  const close = s.indexOf("]", i + 1);
  if (close < 0) return false;
  if (s[close + 1] === "(") return findClosingParen(s, close + 1) >= 0;
  if (s[close + 1] === "[") return s.indexOf("]", close + 2) >= 0;
  return true;
}

function safeHref(raw: string): string | null {
  return sanitizeUrl(decodeEntities(raw));
}

function pushLink(
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

function pushImage(
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

function resolveLinkDef(
  id: string,
  defs: Record<string, LinkDef> | undefined,
): LinkDef | undefined {
  if (!defs) return undefined;
  const key = id.trim().toLowerCase();
  return defs[key] ?? defs[id.trim()];
}

/** 把一行文本解析为行内 AST 节点列表。 */
export function parseInline(text: string, options: ParseOptions = {}): InlineNode[] {
  const streaming = Boolean(options.streaming);
  const linkDefs = options.linkDefs;
  const nodes: InlineNode[] = [];
  let i = 0;
  const s = text;

  while (i < s.length) {
    // 1. 转义
    if (s[i] === "\\" && i + 1 < s.length) {
      const next = s[i + 1]!;
      if (ESCAPABLE.has(next) || next === "\n") {
        if (next === "\n") {
          nodes.push({ type: "break" });
        } else {
          pushText(nodes, next);
        }
        i += 2;
        continue;
      }
      pushText(nodes, "\\");
      i += 1;
      continue;
    }

    // 2. 行内 code
    if (s[i] === "`") {
      let ticks = 1;
      while (s[i + ticks] === "`") ticks += 1;
      const open = s.slice(i, i + ticks);
      const closeAt = s.indexOf(open, i + ticks);
      if (closeAt > i) {
        nodes.push({ type: "code", value: s.slice(i + ticks, closeAt) });
        i = closeAt + ticks;
        continue;
      }
      if (streaming) {
        pushText(nodes, s.slice(i));
        break;
      }
    }

    // 3. 数学
    if (s[i] === "$") {
      const math = parseMathInline(s, i, streaming);
      if (math) {
        nodes.push(math.node);
        i = math.next;
        continue;
      }
      if (streaming && s.startsWith("$$", i)) {
        pushText(nodes, s.slice(i));
        break;
      }
      if (streaming && s[i] === "$") {
        // 可能未闭合的行内数学：若像数学开头则整段文本
        const rest = s.slice(i + 1);
        if (rest && !/\s/.test(rest[0]!) && !rest.includes("$") && !rest.includes("\n")) {
          pushText(nodes, s.slice(i));
          break;
        }
      }
    }

    // 4. HTML 白名单
    if (s[i] === "<") {
      const html = parseHtmlInline(s, i, options);
      if (html) {
        nodes.push(html.node);
        i = html.next;
        continue;
      }
      // <https://...> / <email>
      const angle = /^<([^>\s]+)>/.exec(s.slice(i));
      if (angle) {
        const target = angle[1];
        if (
          /^https?:\/\//i.test(target) ||
          /^mailto:/i.test(target) ||
          /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)
        ) {
          const rawHref =
            target.includes("@") && !target.startsWith("mailto:") ? `mailto:${target}` : target;
          const href = safeHref(rawHref);
          if (href) {
            nodes.push({ type: "autolink", href, text: target.replace(/^mailto:/i, "") });
            i += angle[0].length;
            continue;
          }
        }
      }
    }

    // 5. 图片
    if (s.startsWith("![", i)) {
      const altClose = s.indexOf("]", i + 2);
      if (altClose > i) {
        // ![alt](url) 或 ![alt][id]
        if (s[altClose + 1] === "(") {
          const endParen = findClosingParen(s, altClose + 1);
          if (endParen > altClose) {
            const dest = s.slice(altClose + 2, endParen).trim();
            const [src, titlePart] = splitDestTitle(dest);
            pushImage(nodes, src, s.slice(i + 2, altClose), titlePart);
            i = endParen + 1;
            continue;
          }
        }
        if (s[altClose + 1] === "[") {
          const idClose = s.indexOf("]", altClose + 2);
          if (idClose > altClose) {
            const id = s.slice(altClose + 2, idClose) || s.slice(i + 2, altClose);
            const def = resolveLinkDef(id, linkDefs);
            if (def) {
              pushImage(nodes, def.href, s.slice(i + 2, altClose), def.title);
              i = idClose + 1;
              continue;
            }
          }
        }
      }
      if (streaming) {
        pushText(nodes, s.slice(i, i + 2));
        i += 2;
        continue;
      }
    }

    // 6. 链接 / 脚注 / 引用链接
    if (s[i] === "[") {
      if (streaming && !bracketIsComplete(s, i)) {
        pushText(nodes, s.slice(i));
        break;
      }
      // 脚注 [^id]
      const fn = /^\[\^([^\]]+)\]/.exec(s.slice(i));
      if (fn && s[i + fn[0].length] !== ":") {
        nodes.push({ type: "footnoteRef", id: fn[1] });
        i += fn[0].length;
        continue;
      }

      const close = s.indexOf("]", i + 1);
      if (close > i) {
        const label = s.slice(i + 1, close);
        if (s[close + 1] === "(") {
          const endParen = findClosingParen(s, close + 1);
          if (endParen > close) {
            const dest = s.slice(close + 2, endParen).trim();
            const [href, title] = splitDestTitle(dest);
            pushLink(nodes, href, title, parseInline(label, options));
            i = endParen + 1;
            continue;
          }
        }
        if (s[close + 1] === "[") {
          const idClose = s.indexOf("]", close + 2);
          if (idClose > close) {
            const id = s.slice(close + 2, idClose) || label;
            const def = resolveLinkDef(id, linkDefs);
            if (def) {
              pushLink(nodes, def.href, def.title, parseInline(label, options));
              i = idClose + 1;
              continue;
            }
          }
        }
        // [text][] 折叠引用，以及 [text] 快捷引用
        if (s[close + 1] === "[" && s[close + 2] === "]") {
          const def = resolveLinkDef(label, linkDefs);
          if (def) {
            pushLink(nodes, def.href, def.title, parseInline(label, options));
            i = close + 3;
            continue;
          }
        } else if (s[close + 1] !== "[" && s[close + 1] !== "(" && label.trim()) {
          const def = resolveLinkDef(label, linkDefs);
          if (def) {
            pushLink(nodes, def.href, def.title, parseInline(label, options));
            i = close + 1;
            continue;
          }
        }
      }
      if (streaming) {
        pushText(nodes, "[");
        i += 1;
        continue;
      }
    }

    // 7. 删除线 / 高亮 / 强调 / 下标 / 上标
    if (s.startsWith("~~", i)) {
      const hit = parseWrapped(s, i, "~~", "~~", "strike", options);
      if (hit) {
        nodes.push(hit.node);
        i = hit.next;
        continue;
      }
      if (streaming) {
        pushText(nodes, "~~");
        i += 2;
        continue;
      }
    }

    if (s.startsWith("==", i)) {
      const hit = parseWrapped(s, i, "==", "==", "mark", options);
      if (hit) {
        nodes.push(hit.node);
        i = hit.next;
        continue;
      }
      if (streaming) {
        pushText(nodes, "==");
        i += 2;
        continue;
      }
    }

    // *** / ___ 优先走单标记分支（内部处理三连）
    if (s[i] === "*" || s[i] === "_") {
      const marker = s[i] as "*" | "_";
      let run = 0;
      while (s[i + run] === marker) run += 1;

      if (run >= 3) {
        const hit = parseEmphasisChunk(s, i, marker, false, streaming, options);
        if (hit) {
          nodes.push(...hit.nodes);
          i = hit.next;
          continue;
        }
      }

      if (run >= 2) {
        const hit = parseEmphasisChunk(s, i, marker, true, streaming, options);
        if (hit) {
          nodes.push(...hit.nodes);
          i = hit.next;
          continue;
        }
        if (streaming) {
          pushText(nodes, s.slice(i, i + 2));
          i += 2;
          continue;
        }
      }

      if (run >= 1) {
        const hit = parseEmphasisChunk(s, i, marker, false, streaming, options);
        if (hit) {
          nodes.push(...hit.nodes);
          i = hit.next;
          continue;
        }
        if (streaming) {
          pushText(nodes, marker);
          i += 1;
          continue;
        }
      }
    }

    if (s[i] === "^") {
      const hit = parseWrapped(s, i, "^", "^", "sup", options);
      if (hit) {
        nodes.push(hit.node);
        i = hit.next;
        continue;
      }
    }

    // 硬换行
    if (s.startsWith("  \n", i)) {
      nodes.push({ type: "break" });
      i += 3;
      continue;
    }

    // 裸 URL
    if (s[i] === "h" || s[i] === "w") {
      const auto = parseAutolinkBare(s, i);
      if (auto?.node.type === "autolink") {
        const href = safeHref(auto.node.href);
        if (href) {
          nodes.push({ ...auto.node, href });
          i = auto.next;
          continue;
        }
      }
    }

    let next = s.length;
    for (const marker of [
      "\\",
      "`",
      "$",
      "<",
      "![",
      "[",
      "~~",
      "==",
      "**",
      "__",
      "*",
      "_",
      "^",
      "  \n",
      "http://",
      "https://",
      "www.",
    ]) {
      const at = s.indexOf(marker, i + 1);
      if (at >= 0 && at < next) next = at;
    }
    // 也在下一单词边界找 http
    const slice = s.slice(i, next);
    const httpIn = slice.search(/https?:\/\/|www\./);
    if (httpIn > 0) next = i + httpIn;

    pushText(nodes, s.slice(i, next));
    i = next;
  }

  return nodes.length ? nodes : [{ type: "text", value: "" }];
}
