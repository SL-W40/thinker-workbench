/**
 * MCP 工具轻量索引文本生成。
 *
 * 延迟模式下不把 MCP 工具的完整 parameters 塞进 body.tools，
 * 而是生成一行一条的索引写进 system 段，模型据此决定是否调 tool_search 展开。
 * 形态对齐 skills 的 `<available_skills>` 段（见 skills/loadSkills.ts）。
 */
import type { ChatToolDefinition } from "../../model/types";

/** 索引里单条描述的最大字符数；超长截断，避免少数啰嗦的 server 撑爆 system。 */
const MAX_DESCRIPTION_CHARS = 160;

/** 单行化：换行、制表符折叠成空格，压缩多余空白。 */
function oneLine(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 截断到指定字符数，超出补省略号。 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * 生成 MCP 工具索引文本。
 * @returns 无工具时返回空串，调用方据此决定是否生成 system section
 */
export function buildMcpCatalog(tools: readonly ChatToolDefinition[]): string {
  if (tools.length === 0) return "";
  const lines = tools.map((tool) => {
    const { name, description } = tool.function;
    const desc = truncate(oneLine(description), MAX_DESCRIPTION_CHARS);
    return desc ? `- ${name} — ${desc}` : `- ${name}`;
  });
  return [
    "<available_mcp_tools>",
    "MCP tools are loaded on demand. Their names and summaries are listed below.",
    "To use one, call `tool_search` with a short keyword query; matching tools are then loaded with their full parameters.",
    ...lines,
    "</available_mcp_tools>",
  ].join("\n");
}
