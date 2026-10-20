/**
 * hello：初始化 runtime、Trace、目录、MCP、子代理与工作区根。
 */
import type { UtilityHello } from "@thinker-workbench/shared";
import { configureRuntimeLimits } from "../../config/runtimeLimits";
import { setSubagentDefinitions } from "../../subagents/registry";
import { setWorkspaceRoot } from "../../workspace";
import {
  applyConfig,
  applyDataDir,
  applyMcpServers,
  applyRuntimeSettings,
  applyTrace,
} from "../configApply";
import type { HostContext } from "../hostContext";

export function onHello(ctx: HostContext, message: UtilityHello): void {
  ctx.ensureRuntime(message.checkpointDir);
  applyTrace(ctx.ensureRuntime, message.trace);
  applyConfig({
    catalog: message.catalog,
    selection: message.selection,
    aiLocale: message.aiLocale,
  });
  applyRuntimeSettings(message);
  configureRuntimeLimits(message);
  applyDataDir(message.dataDir);
  void applyMcpServers(message.mcpServers);
  if (message.subagents) setSubagentDefinitions(message.subagents);
  if (message.workspaceRoot) {
    try {
      setWorkspaceRoot(message.workspaceRoot);
    } catch {
      /* 无效根：等 run 时再报错给 UI */
    }
  }
}
