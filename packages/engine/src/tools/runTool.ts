/**
 * 按名称调度已注册工具，并注入 workspaceRoot + signal。
 * 未知工具名返回 ok:false，不抛错。
 */
import { getMcpManager } from "../mcp/McpManager";
import { isMcpToolName } from "../mcp/names";
import { getWorkspaceRoot } from "../workspace";
import { getTool } from "./registry";
import type { ToolArgs, ToolResult } from "./types";

export async function runTool(
  name: string,
  args: ToolArgs,
  signal: AbortSignal,
  callId?: string,
): Promise<ToolResult> {
  if (isMcpToolName(name)) {
    const mcpResult = await getMcpManager().callTool(name, args, signal);
    if (mcpResult) return mcpResult;
  }
  const tool = getTool(name);
  if (!tool) {
    return { ok: false, output: `Unknown tool: ${name}` };
  }
  return tool.run(args, {
    workspaceRoot: getWorkspaceRoot(),
    signal,
    callId,
  });
}
