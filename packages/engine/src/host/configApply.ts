/**
 * 各 handler 共用的配置应用（工作区档位 / 删除许可 / Trace / MCP / 数据根 / 运行时设置）。
 */
import type {
  AiLocale,
  McpServerConfig,
  ModelCatalog,
  ModelSelection,
  TraceSettings,
  UtilityRuntimeSettings,
  WorkspaceAccess,
} from "@thinker-workbench/shared";
import { setDataDir } from "../config/dataDir";
import { getMcpManager } from "../mcp/McpManager";
import { configureModelCatalog } from "../model/catalog";
import { configureHttpCompatibilityMode } from "../model/httpFetch";
import { configureAiLocale } from "../model/openai";
import type { AgentRuntime } from "../runtime/AgentRuntime";
import { configureAgentTrace } from "../trace/emit";
import { setAllowAiDeleteFiles, setWorkspaceAccess } from "../workspace";
import { applyShellConfig } from "./shellConfig";

/**
 * 应用本轮模型目录 / 选用，以及 AI 语言。
 * chatWithFailover 依赖 catalog；仅 configureChatModel 不够。
 */
export function applyConfig(options: {
  catalog?: ModelCatalog | null;
  selection?: ModelSelection | null;
  aiLocale?: AiLocale;
  route?: { userText?: string; contextPaths?: string[]; hasImages?: boolean };
}): void {
  if (options.catalog || options.selection || options.route) {
    configureModelCatalog(options.catalog, options.selection, options.route);
  }
  if (options.aiLocale) configureAiLocale(options.aiLocale);
}

/** 应用工作区外访问档位（有字段才覆盖）。 */
export function applyWorkspaceAccess(access?: WorkspaceAccess): void {
  if (access) setWorkspaceAccess(access);
}

/** 应用是否允许 AI 删除文件（有布尔字段才覆盖）。 */
export function applyAllowAiDeleteFiles(value?: boolean): void {
  setAllowAiDeleteFiles(value);
}

/** 同步 Trace 采集开关。 */
export function applyTrace(
  ensureRuntime: (checkpointDir?: string) => AgentRuntime,
  raw?: TraceSettings,
): void {
  const enabled = raw?.enabled !== false;
  configureAgentTrace({ enabled });
  ensureRuntime().applyTrace({ enabled });
}

/**
 * 应用 hello / run / resume 共用的运行时设置（工作区外访问、AI 删除、shell、HTTP 兼容）。
 * 仅收敛三处逐字节一致的应用；限额（hello 写进程全局、run/resume 走本 run 局部）、trace、
 * catalog/selection、chatMode 因各 handler 有意不同，保留在各自处理里显式调用。
 */
export function applyRuntimeSettings(message: UtilityRuntimeSettings): void {
  applyWorkspaceAccess(message.workspaceAccess);
  applyAllowAiDeleteFiles(message.allowAiDeleteFiles);
  applyShellConfig(message);
  configureHttpCompatibilityMode(message.httpCompatibilityMode);
}

/** 热更新 MCP 配置快照。 */
export async function applyMcpServers(servers?: McpServerConfig[]): Promise<void> {
  await getMcpManager().reload(servers ?? []);
}

/** 应用数据根（rules / skills）。 */
export function applyDataDir(dir?: string): void {
  if (typeof dir === "string") setDataDir(dir);
}
