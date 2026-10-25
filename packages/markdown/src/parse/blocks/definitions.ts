/**
 * 链接定义与脚注：先标记不可解释的「不透明」区（围栏 / 数学块 / 行内代码），
 * 再从剩余行里摘出 `[id]: url "title"` 与 `[^id]:` 声明。
 */
import type { FootnoteDef, LinkDef } from "../../types";
import { type FragmentParser, indentOf, isFenceClose, matchFenceOpen } from "./common";

export function markOpaqueLines(lines: string[]): boolean[] {
  const opaque = new Array<boolean>(lines.length).fill(false);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (indentOf(line) >= 4 && line.trim()) {
      while (i < lines.length) {
        const current = lines[i] ?? "";
        if (!current.trim()) {
          let j = i + 1;
          while (j < lines.length && !(lines[j] ?? "").trim()) j += 1;
          if (j < lines.length && indentOf(lines[j] ?? "") >= 4) {
            opaque[i] = true;
            i += 1;
            continue;
          }
          break;
        }
        if (indentOf(current) < 4) break;
        opaque[i] = true;
        i += 1;
      }
      continue;
    }

    const fence = matchFenceOpen(line);
    if (fence) {
      opaque[i] = true;
      i += 1;
      while (i < lines.length && !isFenceClose(lines[i] ?? "", fence.ch, fence.count)) {
        opaque[i] = true;
        i += 1;
      }
      if (i < lines.length) {
        opaque[i] = true;
        i += 1;
      }
      continue;
    }

    const trimmed = line.trim();
    if (indentOf(line) <= 3 && trimmed.startsWith("$$")) {
      opaque[i] = true;
      const sameLine = trimmed.length > 2 && trimmed.endsWith("$$");
      i += 1;
      if (!sameLine) {
        while (i < lines.length) {
          opaque[i] = true;
          const mathLine = (lines[i] ?? "").trim();
          i += 1;
          if (mathLine === "$$" || mathLine.endsWith("$$")) break;
        }
      }
      continue;
    }

    i += 1;
  }
  return opaque;
}

export function readLinkDestination(rest: string): { href: string; rest: string } | null {
  if (rest.startsWith("<")) {
    let href = "";
    let i = 1;
    while (i < rest.length) {
      if (rest[i] === "\\" && i + 1 < rest.length) {
        href += rest[i + 1];
        i += 2;
        continue;
      }
      if (rest[i] === ">") return { href, rest: rest.slice(i + 1) };
      href += rest[i];
      i += 1;
    }
    return null;
  }
  const matched = /^(\S+)/.exec(rest);
  if (!matched?.[1]) return null;
  return { href: matched[1], rest: rest.slice(matched[1].length) };
}

export function readSameLineTitle(rest: string): string | undefined {
  const matched = /^[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))[ \t]*$/.exec(rest);
  if (!matched) return undefined;
  return matched[1] ?? matched[2] ?? matched[3];
}

export function readNextLineTitle(line: string): string | null {
  const matched = /^ {0,3}(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))[ \t]*$/.exec(line);
  if (!matched) return null;
  return matched[1] ?? matched[2] ?? matched[3] ?? "";
}

/** 抽取链接定义与脚注定义，返回剩余行。 */
export function extractDefs(
  lines: string[],
  parseNested: FragmentParser,
): {
  lines: string[];
  linkDefs: Record<string, LinkDef>;
  footnotes: FootnoteDef[];
} {
  const linkDefs: Record<string, LinkDef> = {};
  const footnotes: FootnoteDef[] = [];
  const kept: string[] = [];
  const opaque = markOpaqueLines(lines);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (opaque[i]) {
      kept.push(line);
      i += 1;
      continue;
    }

    // 脚注 [^id]: ...（最多 3 个前导空格，避免吃掉缩进代码）
    const fn = /^ {0,3}\[\^([^\]]+)\]:[ \t]*(.*)$/.exec(line);
    if (fn) {
      const id = fn[1] ?? "";
      const chunk: string[] = [fn[2] ?? ""];
      i += 1;
      while (i < lines.length && !opaque[i]) {
        const next = lines[i] ?? "";
        if (!next.trim()) {
          if (i + 1 < lines.length && !opaque[i + 1] && /^\s{2,}\S/.test(lines[i + 1] ?? "")) {
            chunk.push("");
            i += 1;
            continue;
          }
          break;
        }
        if (
          /^\s{2,}/.test(next) ||
          (/^\s+/.test(next) && !/^\[\^/.test(next.trim()) && !/^\[[^\]]+\]:/.test(next.trim()))
        ) {
          chunk.push(next.replace(/^\s+/, ""));
          i += 1;
          continue;
        }
        break;
      }
      footnotes.push({
        id,
        children: parseNested(chunk.join("\n").trim(), {}),
      });
      continue;
    }

    // 链接定义 [id]: <url> "title"，标题可以写在下一行
    const head = /^ {0,3}\[([^\]]+)\]:[ \t]*/.exec(line);
    if (head && !(head[1] ?? "").startsWith("^")) {
      const dest = readLinkDestination(line.slice(head[0].length));
      if (dest?.href) {
        let title: string | undefined;
        let next = i + 1;
        if (dest.rest.trim()) {
          title = readSameLineTitle(dest.rest);
          if (title === undefined) {
            kept.push(line);
            i += 1;
            continue;
          }
        } else if (next < lines.length && !opaque[next]) {
          const nextTitle = readNextLineTitle(lines[next] ?? "");
          if (nextTitle !== null) {
            title = nextTitle;
            next += 1;
          }
        }
        linkDefs[(head[1] ?? "").trim().toLowerCase()] = { href: dest.href, title };
        i = next;
        continue;
      }
    }

    kept.push(line);
    i += 1;
  }

  return { lines: kept, linkDefs, footnotes };
}
