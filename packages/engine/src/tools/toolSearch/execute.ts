/**
 * tool_search 执行：按关键词检索 MCP 工具，把命中工具的完整参数定义回给模型，
 * 并登记命中工具名，使其在后续轮次常驻进 body.tools。
 *
 * 只检索当前 ChatMode 允许的工具，避免只读模式下泄露写工具的名字。
 */

import { isToolAllowedForChatMode } from "../../chatMode";
import { getMcpManager } from "../../mcp/McpManager";
import { addLoadedToolNames, getRunContext } from "../../runtime/runContext";
import { DEFAULT_SEARCH_LIMIT, searchMcpTools } from "../deferral";
import type { ToolArgs, ToolExecuteResult } from "../types";

/** 单次返回条数硬上限，防止模型一次性展开过多 schema 反噬上下文。 */
const MAX_SEARCH_LIMIT = 20;

/** 归一化返回条数：缺省 DEFAULT_SEARCH_LIMIT，夹到 1..MAX_SEARCH_LIMIT。 */
function normalizeLimit(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SEARCH_LIMIT;
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.floor(n)));
}

/** 命中结果渲染：名字 + 描述 + 完整 parameters JSON。 */
function formatHits(query: string, hits: ReturnType<typeof searchMcpTools>): string {
  const blocks = hits.map(({ tool }) => {
    const { name, description, parameters } = tool.function;
    return [
      `### ${name}`,
      description,
      "Parameters:",
      "```json",
      JSON.stringify(parameters, null, 2),
      "```",
    ].join("\n");
  });
  return [
    `Matched ${hits.length} MCP tool(s) for "${query}". They are loaded now; call them directly with the parameters below.`,
    "",
    ...blocks,
  ].join("\n");
}

/**
 * 检索并装载 MCP 工具。
 * 无命中时返回 ok:false，让模型知道要换个关键词或放弃。
 */
export async function toolSearchTool(args: ToolArgs): Promise<ToolExecuteResult> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) {
    return {
      ok: false,
      output: "tool_search requires a non-empty `query` (one or more keywords).",
    };
  }

  const ctx = getRunContext();
  const modeOpts = { chatMode: ctx?.chatMode };
  const candidates = getMcpManager()
    .listChatTools()
    .filter((tool) => isToolAllowedForChatMode(tool.function.name, modeOpts));
  if (candidates.length === 0) {
    return { ok: false, output: "No MCP tools are available in the current mode." };
  }

  const hits = searchMcpTools(candidates, query, normalizeLimit(args.limit));
  if (hits.length === 0) {
    return {
      ok: false,
      output: `No MCP tool matched "${query}". Try a shorter or different keyword.`,
    };
  }

  addLoadedToolNames(hits.map((hit) => hit.tool.function.name));
  return { ok: true, output: formatHits(query, hits) };
}
