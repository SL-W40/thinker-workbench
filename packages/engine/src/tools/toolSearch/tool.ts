/**
 * tool_search 元工具规格。
 *
 * 这是延迟加载层的入口：MCP 工具多时它们不再全量进 body.tools，
 * 模型只能通过本工具按需发现。因此它自身必须常驻（见 deferral 过滤豁免）。
 *
 * description / parameters 面向模型（英文），按项目规则保留英文。
 */

import { DEFAULT_SEARCH_LIMIT } from "../deferral";
import { defineTool } from "../defineTool";
import { toolSearchTool } from "./execute";

/** 元工具名；与注册表登记名保持一致。 */
export const TOOL_SEARCH_NAME = "tool_search";

export const toolSearchToolSpec = defineTool({
  name: TOOL_SEARCH_NAME,
  description: [
    "Find and load MCP tools by keyword. MCP tools are not preloaded; only their names and summaries are listed in <available_mcp_tools>.",
    "Call this first whenever a task needs an external service, integration, or capability that the built-in tools do not cover.",
    "Pass one to three keywords that describe the action and the target, for example `github issue` or `slack send message`.",
    "The matching tools are loaded with their full parameters; call the one you need in a later step.",
  ].join(" "),
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "One to three keywords describing the action and target, for example `github issue`.",
      },
      limit: {
        type: "number",
        description: `Maximum number of tools to load. Defaults to ${DEFAULT_SEARCH_LIMIT}.`,
        default: DEFAULT_SEARCH_LIMIT,
      },
    },
    required: ["query"],
  },
  execute: toolSearchTool,
});
