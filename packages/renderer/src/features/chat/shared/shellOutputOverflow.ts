/**
 * Shell 卡片输出是否可能超出折叠行数。
 * 行数启发可覆盖流式写入（此时 DOM 尚未挂上或 measurement effect 未跑）；
 * 实际像素溢出仍由 ShellCard 的 scrollHeight 测量兜底（长行换行）。
 */

/** 折叠时默认可见行数（与 ShellCard CSS 变量一致）。 */
export const SHELL_COLLAPSED_LINES = 4;

/**
 * 按换行粗判是否需要展开控件。
 * @param text 已 stripAnsi 的输出
 * @param maxLines 折叠行数上限
 */
export function shellOutputLikelyOverflows(
  text: string,
  maxLines: number = SHELL_COLLAPSED_LINES,
): boolean {
  if (!text) return false;
  // 末尾空行不计入；至少一行非空才谈溢出
  const lines = text.replace(/\n+$/, "").split("\n");
  return lines.length > maxLines;
}
