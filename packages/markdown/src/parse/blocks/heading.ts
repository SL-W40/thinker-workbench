/**
 * ATX / Setext 标题识别，以及标题锚点去重（同名标题追加 -1 / -2）。
 */
import type { BlockNode } from "../../types";

export function matchAtx(line: string): { level: 1 | 2 | 3 | 4 | 5 | 6; text: string } | null {
  const matched = /^( {0,3})(#{1,6})([ \t]+)(.*)$/.exec(line);
  if (!matched) return null;
  const text = (matched[4] ?? "").replace(/[ \t]+#+\s*$/, "").trim();
  if (!text) return null;
  return { level: matched[2].length as 1 | 2 | 3 | 4 | 5 | 6, text };
}

export function setextLevel(line: string): 1 | 2 | null {
  const matched = /^ {0,3}(=+|-+)[ \t]*$/.exec(line);
  if (!matched) return null;
  return matched[1]?.startsWith("=") ? 1 : 2;
}

export function dedupeHeadingIds(blocks: BlockNode[], seen: Map<string, number>): void {
  for (const block of blocks) {
    if (block.type === "heading") {
      const base = block.id || "section";
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      block.id = count === 0 ? base : `${base}-${count}`;
    } else if (block.type === "blockquote") {
      dedupeHeadingIds(block.children, seen);
    } else if (block.type === "list") {
      for (const item of block.items) dedupeHeadingIds(item.children, seen);
    } else if (block.type === "definitionList") {
      for (const item of block.items) {
        for (const def of item.definitions) dedupeHeadingIds(def, seen);
      }
    }
  }
}
