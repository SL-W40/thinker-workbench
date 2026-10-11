/**
 * Customize 资源根路径解析（User dataDir / Workspace .thinker）。
 */
import fs from "node:fs";
import path from "node:path";
import type { CustomizeScope } from "@thinker-workbench/shared";
import { getDataDir } from "../config/paths";
import { getWorkspace } from "../db/workspacesStore";

export type CustomizeKind = "mcps" | "skills" | "rules" | "agents";

/** 解析可写根目录。 */
export function resolveWritableRoot(scope: CustomizeScope, kind: CustomizeKind): string {
  if (scope.kind === "user") {
    return path.join(getDataDir(), kind);
  }
  const ws = getWorkspace(scope.workspaceId);
  if (!ws) throw new Error("Workspace not found.");
  return path.join(ws.rootPath, ".thinker", kind);
}

/** 确保目录存在。 */
export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 工作区根（由 id）。 */
export function workspaceRootForScope(scope: CustomizeScope): string | null {
  if (scope.kind !== "workspace") return null;
  return getWorkspace(scope.workspaceId)?.rootPath ?? null;
}
