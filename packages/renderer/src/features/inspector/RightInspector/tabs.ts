/**
 * RightInspector 标签键与路径展示纯函数。
 */
import type { WorkspaceNode } from "@thinker-workbench/shared";

/** 从树收集全部文件相对路径（供 Files 搜索）。*/
export function collectFilePaths(node: WorkspaceNode | null): string[] {
  if (!node) return [];
  if (node.type === "file") return [node.path === "." ? "" : node.path].filter(Boolean);
  return (node.children ?? []).flatMap(collectFilePaths);
}

export function fileTabKey(path: string): string {
  return `file:${path}`;
}

export function baseName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export function langBadge(path: string): string {
  if (!path) return "NEW";
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "tsx") return "TSX";
  if (ext === "ts") return "TS";
  if (ext === "jsx") return "JSX";
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "JS";
  if (ext === "json") return "{}";
  if (ext === "md") return "MD";
  if (ext === "css" || ext === "less") return "CSS";
  return (ext || "FILE").slice(0, 4).toUpperCase();
}

/** 规范化工作空间相对路径。*/
export function normalizeRelPath(raw: string): string {
  return raw.trim().replace(/\\/g, "/").replace(/^\//, "");
}

export function isDraftTabKey(key: string): boolean {
  return key.startsWith("draft:");
}
