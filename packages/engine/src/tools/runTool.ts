/**
 * 按名称调度已注册工具，并注入 workspaceRoot + signal。
 * 未知工具名返回 ok:false，不抛错。
 */
import { withJsonPreview, withTextPreview } from "@thinker-workbench/logger";
import { agentLog } from "../log/setup";
import { getWorkspaceRoot } from "../workspace";
import { getTool } from "./registry";
import type { ToolArgs, ToolResult } from "./types";

export async function runTool(
  name: string,
  args: ToolArgs,
  signal: AbortSignal,
): Promise<ToolResult> {
  const log = agentLog("tools.run");
  const tool = getTool(name);
  if (!tool) {
    log.warn("unknown tool", { meta: { name } });
    return { ok: false, output: `Unknown tool: ${name}` };
  }
  const started = Date.now();
  log.info("invoke", {
    spanId: name,
    meta: { name, argKeys: Object.keys(args), ...withJsonPreview(args, "args") },
  });
  try {
    const result = await tool.run(args, { workspaceRoot: getWorkspaceRoot(), signal });
    log.info("result", {
      spanId: name,
      meta: {
        name,
        ok: result.ok,
        ms: Date.now() - started,
        ...withTextPreview(result.output, "output"),
      },
    });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error("throw", { spanId: name, meta: { name, error, ms: Date.now() - started } });
    throw err;
  }
}
