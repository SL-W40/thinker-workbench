/**
 * Customize 作用域分组辅助：比较 scope、解析工作区根、生成分组定义。
 */
import type { CustomizeScope, WorkspaceRecord } from "@thinker-workbench/shared";
import { customizeScopeKey } from "@thinker-workbench/shared";

/** 两个作用域是否相同（缺省视为 user）。 */
export function sameCustomizeScope(a: CustomizeScope | undefined, b: CustomizeScope): boolean {
  if (!a) return b.kind === "user";
  if (a.kind === "user" || b.kind === "user") {
    return a.kind === "user" && b.kind === "user";
  }
  return a.workspaceId === b.workspaceId;
}

/** 当前 scope 对应的工作区根（用于 list）。 */
export function workspaceRootForScope(
  scope: CustomizeScope,
  workspaces: WorkspaceRecord[],
): string | null {
  if (scope.kind !== "workspace") return null;
  return workspaces.find((w) => w.id === scope.workspaceId)?.rootPath ?? null;
}

export type ScopeGroupDef = {
  key: string;
  scope: CustomizeScope;
  /** 工作区根；user 为 null。 */
  workspaceRoot: string | null;
  /** 工作区显示名；user 组为空串。 */
  name: string;
};

/** 用户组 + 每个已登记工作区各一组。 */
export function buildScopeGroups(workspaces: WorkspaceRecord[]): ScopeGroupDef[] {
  return [
    {
      key: "user",
      scope: { kind: "user" },
      workspaceRoot: null,
      name: "",
    },
    ...workspaces.map((w) => ({
      key: customizeScopeKey({ kind: "workspace", workspaceId: w.id }),
      scope: { kind: "workspace" as const, workspaceId: w.id },
      workspaceRoot: w.rootPath,
      name: w.name,
    })),
  ];
}

export { customizeScopeKey };
