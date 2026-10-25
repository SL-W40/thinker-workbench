/**
 * git_status 工具规格：工作树状态（分支 / ahead-behind / 变更文件与增删行数）。
 */
import { defineTool } from "../defineTool";
import { gitStatusTool } from "./execute";

export const gitStatusToolSpec = defineTool({
  name: "git_status",
  description:
    "Read-only repository inspection: current branch, ahead/behind versus upstream, and every changed file with added/removed line counts. Use before git_diff to see which files changed.",
  parameters: {
    type: "object",
    properties: {
      maxChars: {
        type: "number",
        description: "Optional output cap in characters (default 8000, hard max 40000).",
      },
    },
  },
  execute: gitStatusTool,
});
