/**
 * 简易 unified diff：去掉首尾相同行后输出中间变更，并截断过长输出。
 */

const MAX_HUNK_LINES = 2000;
const CONTEXT = 3;

/** 空串视为 0 行，避免 `"".split("\n") === [""]` 干扰新建文件 diff。 */
function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.split("\n");
}

/**
 * @param filePath 展示用路径（工作区相对）
 * @param before 修改前全文
 * @param after 修改后全文
 */
export function buildUnifiedDiff(filePath: string, before: string, after: string): string {
  if (before === after) return "";

  const a = splitLines(before);
  const b = splitLines(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const ctxStart = Math.max(0, start - CONTEXT);
  const oldEnd = Math.min(a.length - 1, endA + CONTEXT);
  const newEnd = Math.min(b.length - 1, endB + CONTEXT);
  const oldCount = oldEnd - ctxStart + 1;
  const newCount = newEnd - ctxStart + 1;

  /** @type {string[]} */
  const body: string[] = [];

  // 前导上下文（a/b 相同）
  for (let i = ctxStart; i < start; i++) body.push(` ${a[i]}`);
  // 删除行
  for (let i = start; i <= endA; i++) body.push(`-${a[i] ?? ""}`);
  // 新增行
  for (let i = start; i <= endB; i++) body.push(`+${b[i] ?? ""}`);
  // 尾部上下文（取 a 侧，与 b 公共后缀一致）
  for (let i = 0; i < CONTEXT; i++) {
    const ai = endA + 1 + i;
    const bi = endB + 1 + i;
    if (ai >= a.length || bi >= b.length) break;
    body.push(` ${a[ai]}`);
  }

  let lines = body;
  let truncated = false;
  if (lines.length > MAX_HUNK_LINES) {
    lines = lines.slice(0, MAX_HUNK_LINES);
    truncated = true;
  }

  const out = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${ctxStart + 1},${Math.max(oldCount, 0)} +${ctxStart + 1},${Math.max(newCount, 0)} @@`,
    ...lines,
  ];
  if (truncated) out.push(`\\ Diff truncated at ${MAX_HUNK_LINES} lines`);
  return out.join("\n");
}
