/**
 * 文件工具对工作区外路径的访问档位。
 * - `workspace`：读写均不可越界
 * - `readOutside`：可读区外绝对路径，写仍限工作区内
 * - `full`：读写均可越界
 */
export const WORKSPACE_ACCESS_OPTIONS = ["workspace", "readOutside", "full"] as const;
/** 工作区访问档位联合类型。 */
export type WorkspaceAccess = (typeof WORKSPACE_ACCESS_OPTIONS)[number];
/** 默认：可读工作区外。 */
export const DEFAULT_WORKSPACE_ACCESS: WorkspaceAccess = "readOutside";

/** 将未知值规范为合法工作区访问档位。 */
export function normalizeWorkspaceAccess(
  value: unknown,
  fallback: WorkspaceAccess = DEFAULT_WORKSPACE_ACCESS,
): WorkspaceAccess {
  return typeof value === "string" &&
    (WORKSPACE_ACCESS_OPTIONS as readonly string[]).includes(value)
    ? (value as WorkspaceAccess)
    : fallback;
}
