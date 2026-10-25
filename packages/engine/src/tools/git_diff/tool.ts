/**
 * git_diff 工具规格：查看改动内容的 unified diff。
 */
import { defineTool } from "../defineTool";
import { gitDiffTool } from "./execute";

export const gitDiffToolSpec = defineTool({
  name: "git_diff",
  description:
    "Read-only unified diff of the working tree. Omit parameters.paths for all changed files, or pass specific workspace-relative paths to keep the output small. No write operations are available through git tools.",
  parameters: {
    type: "object",
    properties: {
      paths: {
        type: "array",
        items: { type: "string" },
        description: "Optional workspace-relative paths, max 20. Omit for all changes.",
      },
      contextLines: {
        type: "number",
        description: "Unified context lines (default 3, max 30).",
      },
      maxChars: {
        type: "number",
        description: "Optional output cap in characters (default 8000, hard max 40000).",
      },
    },
  },
  execute: gitDiffTool,
});
