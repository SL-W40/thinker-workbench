/**
 * 文件类工具共用的 path 参数文案（面向模型）。
 * Schema 在注册时固定，细则以 environment_context.workspace.access 为准。
 */

/**
 * path 参数中性说明。
 * 越界规则见 `<environment_context>.workspace.access` / `paths.tool_path_style`。
 */
export const WORKSPACE_PATH_DESCRIPTION =
  "Path relative to environment_context.workspace.root (prefer forward slashes). Whether absolute paths may leave that root depends on environment_context.workspace.access (see paths.tool_path_style). Empty or omitted means the workspace root where applicable.";

/**
 * 按读写意图生成说明（供动态拼装时使用；当前工具 schema 多用上方常量）。
 */
export function workspacePathDescription(intent: "read" | "write"): string {
  if (intent === "read") {
    return `${WORKSPACE_PATH_DESCRIPTION} This is a read tool.`;
  }
  return `${WORKSPACE_PATH_DESCRIPTION} This is a write tool.`;
}
