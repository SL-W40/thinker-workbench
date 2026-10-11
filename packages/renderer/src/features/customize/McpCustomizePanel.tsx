/**
 * Customize → MCPs：复用 MCP 表单，按作用域分组。
 */
import type { WorkspaceRecord } from "@thinker-workbench/shared";
import { McpSettingsForm } from "../settings/McpSettingsForm";

type Props = {
  workspaces: WorkspaceRecord[];
};

/** MCP 面板（样式与文案沿用 settings.mcp）。 */
export function McpCustomizePanel({ workspaces }: Props) {
  return <McpSettingsForm workspaces={workspaces} />;
}
