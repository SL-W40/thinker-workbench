/**
 * MCP 工具延迟加载门面。
 *
 * 背景：MCP 单 server 封顶 64、总计 128，全量并列进 body.tools 时很容易吃掉
 * 10K+ tokens。内置 31 个工具在业界经验阈值（20~40 个 / 5K tokens）以内且高频
 * 使用，因此只对 MCP 做延迟。
 *
 * 对称性（本模块的设计蓝本，照搬 skills 的渐进式披露）：
 *   skills: catalogText（索引，常驻） → 命中 → activatedText（正文）
 *   tools : catalog（索引，常驻）      → 命中 → parameters（完整 schema）
 *
 * 降级保障：执行层 runTool() 按名字查 MCP manager，不依赖 body.tools，
 * 因此模型即使不 search 直接调用也能执行；参数错误由 MCP server 自行校验返回。
 */
import { DEFAULT_CONTEXT_WINDOW } from "@thinker-workbench/shared";
import { estimateTokens } from "../../context/tokens";
import type { ChatToolDefinition } from "../../model/types";

/** MCP 工具数超过此值才切延迟模式；以下时行为与全量完全一致。 */
export const MAX_EAGER_MCP_TOOLS = 12;

/** MCP schema 的绝对 token 上限。 */
export const MAX_EAGER_MCP_SCHEMA_TOKENS = 2000;

/**
 * MCP schema 占上下文窗口的比例上限。
 * 取 10% 是 Claude Code 的阈值；再与绝对值取较小者，让小窗口模型也能自动收紧。
 */
export const MAX_EAGER_MCP_SCHEMA_RATIO = 0.1;

/** 单次 tool_search 默认返回条数。 */
export const DEFAULT_SEARCH_LIMIT = 5;

/** 索引段的 system section id（Trace 折叠展示用）。 */
export const MCP_CATALOG_SECTION_ID = "mcpCatalog";

export { buildMcpCatalog } from "./catalog";
export type { McpToolSearchHit } from "./search";
export { searchMcpTools } from "./search";

/** 估算一组工具 schema 序列化后的 token 数。 */
export function estimateMcpSchemaTokens(tools: readonly ChatToolDefinition[]): number {
  if (tools.length === 0) return 0;
  return estimateTokens(JSON.stringify(tools));
}

/** 常驻模式的 schema token 上限：绝对上限与窗口比例的较小者。 */
function eagerSchemaTokenLimit(contextWindow?: number): number {
  const window =
    typeof contextWindow === "number" && Number.isFinite(contextWindow) && contextWindow > 0
      ? Math.floor(contextWindow)
      : DEFAULT_CONTEXT_WINDOW;
  return Math.min(MAX_EAGER_MCP_SCHEMA_TOKENS, Math.floor(window * MAX_EAGER_MCP_SCHEMA_RATIO));
}

/**
 * 总开关；置 `TW_DEFER_MCP_TOOLS=0` 可零成本回退到全量路径。
 * 对齐项目已有的 `TW_DEV_NO_HOT` / `THINKER_OPEN_DEVTOOLS` 开关风格。
 */
export function deferMcpToolsEnabled(): boolean {
  const raw = process.env.TW_DEFER_MCP_TOOLS?.trim().toLowerCase();
  if (!raw) return true;
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

/**
 * 是否切换到延迟模式：工具数或 schema 体积任一超阈值即切换。
 * @param tools 候选 MCP 工具（应已按 ChatMode 过滤）
 * @param contextWindow 当前上下文窗口，用于按比例收紧
 */
export function shouldDeferMcpTools(
  tools: readonly ChatToolDefinition[],
  contextWindow?: number,
): boolean {
  if (!deferMcpToolsEnabled()) return false;
  if (tools.length === 0) return false;
  if (tools.length > MAX_EAGER_MCP_TOOLS) return true;
  return estimateMcpSchemaTokens(tools) > eagerSchemaTokenLimit(contextWindow);
}

/**
 * 从候选中取出「已装载」的工具定义（保持候选集原有顺序）。
 * 只在延迟模式下使用；非延迟模式调用方本就拿到了全量列表。
 */
export function expandMcpTools(
  tools: readonly ChatToolDefinition[],
  loadedNames: readonly string[] | undefined,
): ChatToolDefinition[] {
  if (!loadedNames || loadedNames.length === 0) return [];
  const wanted = new Set(loadedNames.map((name) => name.trim()).filter(Boolean));
  if (wanted.size === 0) return [];
  return tools.filter((tool) => wanted.has(tool.function.name));
}
