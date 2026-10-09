/**
 * Markdown AST 节点类型：行内、块级与列表项。
 */

/** 行内节点（文本、强调、链接、数学等）。 */
export type InlineNode =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "emphasis"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "mark"; children: InlineNode[] }
  | { type: "sub"; children: InlineNode[] }
  | { type: "sup"; children: InlineNode[] }
  | { type: "underline"; children: InlineNode[] }
  | { type: "kbd"; value: string }
  | { type: "link"; href: string; title?: string; children: InlineNode[] }
  | { type: "image"; src: string; alt: string; title?: string }
  | { type: "autolink"; href: string; text: string }
  | { type: "footnoteRef"; id: string }
  | { type: "math"; value: string; display?: false }
  | { type: "break" };

/** 列表项；`task` 为 true 时表示任务列表。 */
export type ListItem = {
  task: boolean;
  checked: boolean;
  children: BlockNode[];
};

/** 定义列表的一项。 */
export type DefinitionItem = {
  term: InlineNode[];
  definitions: BlockNode[][];
};

/** 脚注定义。 */
export type FootnoteDef = {
  id: string;
  children: BlockNode[];
};

/** 引用式链接定义。 */
export type LinkDef = {
  href: string;
  title?: string;
};

/** 块级节点（标题、段落、代码、图表、表格等）。 */
export type BlockNode =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; id: string; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "blockquote"; children: BlockNode[] }
  | { type: "code"; lang: string; value: string; meta?: string; incomplete?: boolean }
  | { type: "diagram"; lang: string; value: string; incomplete?: boolean }
  | { type: "list"; ordered: boolean; start?: number; items: ListItem[] }
  | {
      type: "table";
      headers: InlineNode[][];
      aligns: Array<"left" | "center" | "right" | null>;
      rows: InlineNode[][][];
      incomplete?: boolean;
    }
  | { type: "definitionList"; items: DefinitionItem[] }
  | { type: "math"; value: string; display: true; incomplete?: boolean }
  | { type: "hr" }
  | { type: "pending"; kind: "table" | "paragraph" | "fence" | "math"; value: string };

/** 完整文档解析结果（含脚注与链接定义）。 */
export type MarkdownDocument = {
  blocks: BlockNode[];
  footnotes: FootnoteDef[];
  linkDefs: Record<string, LinkDef>;
};
