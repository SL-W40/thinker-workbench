/**
 * 行内解析主循环。
 *
 * 各类标记的识别原本集中在这一个文件里（616 行），现已按标记类型拆到 `inline/` 下：
 * `scan`（扫描原语）、`text`（文本节点）、`emphasis`（粗斜体 / 删除线 / 高亮 / 上下标）、
 * `htmlMath`（白名单 HTML 与公式）、`link`（链接 / 图片 / 引用定义）。
 *
 * 强调标记与行内 HTML 的内容允许嵌任意行内结构，必须回调主循环；
 * 这里用三个薄包装把自身绑定进去（等价于原先的同文件相互递归），
 * 依赖方向依旧是单向的「主循环 → 子模块」。
 */
import type { InlineNode, LinkDef } from "../types";
import { decodeEntities } from "./entities";
import {
  ESCAPABLE,
  parseEmphasisChunk as rawParseEmphasisChunk,
  parseWrapped as rawParseWrapped,
} from "./inline/emphasis";
import { parseMathInline, parseHtmlInline as rawParseHtmlInline } from "./inline/htmlMath";
import {
  bracketIsComplete,
  parseAutolinkBare,
  pushImage,
  pushLink,
  resolveLinkDef,
  safeHref,
  splitDestTitle,
} from "./inline/link";
import { canOpenEmphasis, findClosingParen, isWordChar } from "./inline/scan";
import { pushText } from "./inline/text";
import type { ParseOptions } from "./options";
import { sanitizeImageSrc, sanitizeUrl } from "./url";

function parseEmphasisChunk(
  s: string,
  i: number,
  marker: "*" | "_",
  double: boolean,
  streaming: boolean,
  options: ParseOptions,
) {
  return rawParseEmphasisChunk(s, i, marker, double, streaming, options, parseInline);
}

function parseWrapped(
  s: string,
  i: number,
  open: string,
  close: string,
  type: "mark" | "strike" | "sub" | "sup",
  options: ParseOptions,
) {
  return rawParseWrapped(s, i, open, close, type, options, parseInline);
}

function parseHtmlInline(s: string, i: number, options: ParseOptions) {
  return rawParseHtmlInline(s, i, options, parseInline);
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
      const next = s[i + 1] ?? "";
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
        if (rest && !/\s/.test(rest.charAt(0)) && !rest.includes("$") && !rest.includes("\n")) {
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
