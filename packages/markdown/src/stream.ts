/**
 * 流式安全解析：未完成围栏 / 表格 / 数学不抛错，并返回开放构造信息。
 */
import { parseMarkdown, parseMarkdownDocument } from "./parse/blocks";
import type { ParseOptions } from "./parse/options";
import type { BlockNode, MarkdownDocument } from "./types";

export type StreamingParseResult = {
  blocks: BlockNode[];
  footnotes: MarkdownDocument["footnotes"];
  linkDefs: MarkdownDocument["linkDefs"];
  /** 尾部仍有未闭合围栏 / 未完成表格等时为 true。 */
  incomplete: boolean;
  /** 缓冲区末尾的开放构造（若有）。 */
  open:
    | { kind: "code" | "diagram"; lang: string; value: string }
    | { kind: "table"; value: string }
    | { kind: "math"; value: string }
    | null;
};

function findOpen(blocks: BlockNode[]): StreamingParseResult["open"] {
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const b = blocks[i];
    if (b.type === "code" && b.incomplete) {
      return { kind: "code", lang: b.lang, value: b.value };
    }
    if (b.type === "diagram" && b.incomplete) {
      return { kind: "diagram", lang: b.lang, value: b.value };
    }
    if (b.type === "pending" && b.kind === "table") {
      return { kind: "table", value: b.value };
    }
    if (b.type === "pending" && b.kind === "math") {
      return { kind: "math", value: b.value };
    }
    if (b.type === "table" && b.incomplete) {
      return { kind: "table", value: "" };
    }
    if (b.type === "math" && b.incomplete) {
      return { kind: "math", value: b.value };
    }
  }
  return null;
}

/** 以流式安全模式解析 markdown。对部分输入永不抛错。 */
export function parseMarkdownStreaming(md: string): StreamingParseResult {
  try {
    const doc = parseMarkdownDocument(md ?? "", { streaming: true });
    const open = findOpen(doc.blocks);
    return {
      blocks: doc.blocks,
      footnotes: doc.footnotes,
      linkDefs: doc.linkDefs,
      incomplete: Boolean(open),
      open,
    };
  } catch {
    const blocks: BlockNode[] = [{ type: "pending", kind: "paragraph", value: md ?? "" }];
    return { blocks, footnotes: [], linkDefs: {}, incomplete: true, open: null };
  }
}

/** 解析 markdown；失败时回退为单段 pending 段落。 */
export function parseMarkdownSafe(md: string, options: ParseOptions = {}): BlockNode[] {
  try {
    return parseMarkdown(md ?? "", options);
  } catch {
    return [{ type: "pending", kind: "paragraph", value: md ?? "" }];
  }
}

/** 缓冲区中是否仍有未闭合的 mermaid/代码围栏。 */
export function hasOpenFence(md: string): boolean {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  let open: { ch: string; count: number } | null = null;
  for (const line of lines) {
    const m = /^(`{3,}|~{3,})(.*)$/.exec(line);
    if (!m) continue;
    const fence = m[1];
    const ch = fence[0]!;
    const count = fence.length;
    if (!open) {
      open = { ch, count };
      continue;
    }
    if (ch === open.ch && count >= open.count && !m[2].trim()) {
      open = null;
    }
  }
  return Boolean(open);
}
