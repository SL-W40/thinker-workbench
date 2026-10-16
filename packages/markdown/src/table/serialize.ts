/**
 * 将表格 AST 序列化为 Markdown / TSV / CSV，供复制与导出。
 */
import type { InlineNode } from "../types";

export type TableAlign = "left" | "center" | "right" | null;

/** 行内节点 → 纯文本（忽略强调等标记）。 */
export function inlineToPlainText(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === "text" || n.type === "code" || n.type === "kbd") return n.value;
      if (n.type === "autolink") return n.text;
      if (n.type === "math") return n.value;
      if (n.type === "image") return n.alt;
      if (n.type === "break") return " ";
      if (n.type === "footnoteRef") return "";
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
        return inlineToPlainText(n.children);
      }
      return "";
    })
    .join("");
}

/** 表头 + 行 → 二维纯文本矩阵。 */
export function tableToMatrix(headers: InlineNode[][], rows: InlineNode[][][]): string[][] {
  const head = headers.map(inlineToPlainText);
  const body = rows.map((row) => headers.map((_, i) => inlineToPlainText(row[i] ?? [])));
  return [head, ...body];
}

function escapeMdCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function alignSep(align: TableAlign): string {
  if (align === "left") return ":---";
  if (align === "right") return "---:";
  if (align === "center") return ":---:";
  return "---";
}

/** 导出为 GFM 管道表。 */
export function tableToMarkdown(
  headers: InlineNode[][],
  aligns: TableAlign[],
  rows: InlineNode[][][],
): string {
  const matrix = tableToMatrix(headers, rows);
  if (matrix.length === 0) return "";
  const colCount = matrix[0]!.length;
  const lines: string[] = [];
  const head = matrix[0]!.map(escapeMdCell);
  lines.push(`| ${head.join(" | ")} |`);
  lines.push(
    `| ${Array.from({ length: colCount }, (_, i) => alignSep(aligns[i] ?? null)).join(" | ")} |`,
  );
  for (const row of matrix.slice(1)) {
    const cells = Array.from({ length: colCount }, (_, i) => escapeMdCell(row[i] ?? ""));
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

/** 制表符分隔（便于粘贴到 Excel / Sheets）。 */
export function tableToTsv(headers: InlineNode[][], rows: InlineNode[][][]): string {
  return tableToMatrix(headers, rows)
    .map((row) => row.map((cell) => cell.replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))
    .join("\n");
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** RFC 风格 CSV（逗号分隔，必要时加引号）。 */
export function tableToCsv(headers: InlineNode[][], rows: InlineNode[][][]): string {
  return tableToMatrix(headers, rows)
    .map((row) => row.map(escapeCsvField).join(","))
    .join("\n");
}
