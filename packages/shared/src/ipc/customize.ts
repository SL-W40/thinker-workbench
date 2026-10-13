/**
 * Customize 资源作用域与列表元数据（MCP / Skills / Rules / Subagents）。
 */

/** User = dataDir；Workspace = 指定工作区根下 .thinker。 */
export type CustomizeScope = { kind: "user" } | { kind: "workspace"; workspaceId: string };

/** 列表项来源标签。 */
export type CustomizeSource = "thinker-user" | "thinker-workspace";

/** 规范化 scope（缺省 user）。 */
export function normalizeCustomizeScope(raw: unknown): CustomizeScope {
  if (!raw || typeof raw !== "object") return { kind: "user" };
  const o = raw as Record<string, unknown>;
  if (o.kind === "workspace" && typeof o.workspaceId === "string" && o.workspaceId.trim()) {
    return { kind: "workspace", workspaceId: o.workspaceId.trim() };
  }
  return { kind: "user" };
}

/** scope 稳定键。 */
export function customizeScopeKey(scope: CustomizeScope): string {
  return scope.kind === "user" ? "user" : `workspace:${scope.workspaceId}`;
}
