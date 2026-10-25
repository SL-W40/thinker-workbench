/**
 * MCP 工具关键词检索：名字 token 优先、serverId 次之、描述兜底的加权打分。
 *
 * 工具名形如 mcp__github__create_issue，天然按 `_` 分词，
 * 在 128 个工具的规模下 O(n) 扫描即可，不引入检索依赖。
 */

import { parseMcpToolName } from "../../mcp/names";
import type { ChatToolDefinition } from "../../model/types";

/** 打分权重（从高到低）。 */
const WEIGHT_NAME_TOKEN = 6;
const WEIGHT_NAME_PREFIX = 3;
const WEIGHT_SERVER = 4;
const WEIGHT_DESCRIPTION = 1;

/** 单条检索结果。 */
export type McpToolSearchHit = {
  tool: ChatToolDefinition;
  score: number;
};

/** 按非字母数字切词；MCP 名字里的 `_` 也是分隔符。 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/** 单条工具相对一组 query token 的得分；无命中为 0。 */
function scoreTool(tool: ChatToolDefinition, queryTokens: string[]): number {
  const parsed = parseMcpToolName(tool.function.name);
  const nameTokens = new Set(
    tokenize(parsed ? `${parsed.serverId} ${parsed.toolName}` : tool.function.name),
  );
  const serverId = (parsed?.serverId ?? "").toLowerCase();
  const description = tool.function.description.toLowerCase();

  let score = 0;
  for (const token of queryTokens) {
    if (nameTokens.has(token)) {
      score += WEIGHT_NAME_TOKEN;
      continue;
    }
    // serverId 为空串时 includes 恒为 false，无需额外判空
    if (serverId.includes(token)) {
      score += WEIGHT_SERVER;
      continue;
    }
    for (const nameToken of nameTokens) {
      if (nameToken.startsWith(token)) {
        score += WEIGHT_NAME_PREFIX;
        break;
      }
    }
    if (description.includes(token)) score += WEIGHT_DESCRIPTION;
  }
  return score;
}

/**
 * 检索 MCP 工具，返回按得分降序的命中项。
 * 同分时按工具名字典序，保证结果稳定可测。
 * @param tools 候选工具（应已按 ChatMode 过滤）
 * @param query 模型给的关键词；空查询返回空结果
 * @param limit 返回条数上限
 */
export function searchMcpTools(
  tools: readonly ChatToolDefinition[],
  query: string,
  limit = 5,
): McpToolSearchHit[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0 || limit <= 0) return [];

  const hits: McpToolSearchHit[] = [];
  for (const tool of tools) {
    const score = scoreTool(tool, queryTokens);
    if (score <= 0) continue;
    hits.push({ tool, score });
  }
  hits.sort(
    (a, b) => b.score - a.score || a.tool.function.name.localeCompare(b.tool.function.name),
  );
  return hits.slice(0, limit);
}
