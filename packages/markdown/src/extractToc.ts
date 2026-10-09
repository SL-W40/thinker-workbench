/**
 * 从 Markdown 抽取目录（标题 id / 层级 / 纯文本）。
 */
import { parseMarkdown } from "./parse/blocks";
import type { BlockNode, InlineNode } from "./types";

export type TocItem = {
  /** 标题锚点 id。 */
  id: string;
  /** 标题层级 1–6。 */
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** 扁平后的标题纯文本。 */
  text: string;
};

function inlineText(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === "text" || n.type === "code" || n.type === "kbd") return n.value;
      if (n.type === "autolink") return n.text;
      if (n.type === "math") return n.value;
      if (n.type === "image") return n.alt;
      if (n.type === "break") return " ";
      if (
        n.type === "strong" ||
        n.type === "emphasis" ||
        n.type === "strike" ||
        n.type === "mark" ||
        n.type === "sub" ||
        n.type === "sup" ||
        n.type === "underline" ||
        n.type === "link"
      ) {
        return inlineText(n.children);
      }
      return "";
    })
    .join("");
}

function walk(blocks: BlockNode[], out: TocItem[]): void {
  for (const b of blocks) {
    if (b.type === "heading") {
      out.push({ id: b.id, level: b.level, text: inlineText(b.children) });
    } else if (b.type === "blockquote") {
      walk(b.children, out);
    } else if (b.type === "list") {
      for (const item of b.items) walk(item.children, out);
    }
  }
}

/** 解析 markdown 并返回目录项列表。 */
export function extractToc(markdown: string): TocItem[] {
  const out: TocItem[] = [];
  walk(parseMarkdown(markdown), out);
  return out;
}
