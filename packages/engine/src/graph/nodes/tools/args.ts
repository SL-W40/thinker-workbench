/**
 * tools 节点参数解析与 UI 提示（纯函数）。
 */
import { buildUnifiedDiff } from "../../../tools/shared/diff";
import type { ToolArgs } from "../../../tools/types";

/**
 * 当工具未附带 ui.diff 时，用参数拼一份可见 diff（改文档等大段写入也能在时间线展示）。
 */
export function fallbackDiff(name: string, args: ToolArgs): string | undefined {
  const path = typeof args.path === "string" && args.path.trim() ? args.path.trim() : "file";
  if (name === "edit_file") {
    const oldString = typeof args.old_string === "string" ? args.old_string : null;
    const newString = typeof args.new_string === "string" ? args.new_string : null;
    if (oldString == null || newString == null || oldString === newString) return undefined;
    return buildUnifiedDiff(path, oldString, newString);
  }
  if (name === "write_file" && typeof args.contents === "string") {
    return buildUnifiedDiff(path, "", args.contents);
  }
  return undefined;
}

/** 解析模型给出的 arguments 字符串；必须是 JSON 对象。 */
export function parseToolArgs(
  raw: string,
): { ok: true; args: ToolArgs } | { ok: false; error: string } {
  const trimmed = raw?.trim() || "{}";
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "Tool arguments must be a JSON object." };
    }
    return { ok: true, args: value as ToolArgs };
  } catch {
    return { ok: false, error: `Invalid JSON arguments: ${trimmed.slice(0, 200)}` };
  }
}

/** 从参数抽出 path / 一行摘要（搜索词等）；改文件预览走 diff，不再塞 replace 摘要。 */
export function toolUiHints(name: string, args: ToolArgs): { path?: string; summary?: string } {
  // browser_navigate：用 url 作可点路径；snapshot / screenshot 用短标签触发展开
  if (name === "browser_navigate" && typeof args.url === "string" && args.url.trim()) {
    return { path: args.url.trim() };
  }
  if (name === "browser_snapshot") {
    return { path: "snapshot" };
  }
  if (name === "browser_screenshot") {
    return { path: "screenshot" };
  }
  const path = typeof args.path === "string" ? args.path : undefined;
  const bits: string[] = [];
  if (typeof args.pattern === "string" && args.pattern) bits.push(args.pattern);
  if (typeof args.query === "string" && args.query) bits.push(args.query);
  if (typeof args.glob === "string" && args.glob) bits.push(args.glob);
  if (
    (name === "read_file" || name === "write_file") &&
    typeof args.start_line === "number" &&
    typeof args.end_line === "number"
  ) {
    bits.push(`L${args.start_line}-L${args.end_line}`);
  }
  if (name === "delete_file" && args.recursive === true) bits.push("recursive");
  if (typeof args.command === "string" && args.command) bits.push(args.command.slice(0, 80));
  const summary = bits.length > 0 ? bits.join(" · ") : undefined;
  return { path, summary };
}
