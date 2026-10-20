/**
 * 悬停预览用的纯文本/大小格式化工具（无外部依赖，便于单测）。
 */

/** 文件大小易读格式化。 */
export function formatFileSize(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** 内容预览截断：先取前 maxLines 行，再截断到 maxChars，超出补省略号。 */
export function summarizeTextPreview(content: string, maxChars: number, maxLines: number): string {
  if (!content) return "";
  const lines = content.split(/\r?\n/);
  const taken = lines.slice(0, maxLines);
  let out = taken.join("\n");
  if (lines.length > maxLines) out += "\n…";
  if (out.length > maxChars) out = `${out.slice(0, maxChars).trimEnd()} …`;
  return out;
}
