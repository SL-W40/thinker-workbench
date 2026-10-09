/**
 * grep 工具规格：按正则在工作区文本文件中搜行。
 * description / parameters 文案面向模型（英文）。
 */
import { defineTool } from "../defineTool";
import { WORKSPACE_PATH_DESCRIPTION } from "../shared/pathParam";
import { grepTool } from "./execute";

export const grepToolSpec = defineTool({
  name: "grep",
  description:
    "Regex search over text file contents under a path resolved against workspace.root (see workspace.access). Skips node_modules/.git/etc. Caps matches.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "JavaScript regular expression to match against each line.",
      },
      path: {
        type: "string",
        description: `${WORKSPACE_PATH_DESCRIPTION} Searches the whole workspace when empty/omitted.`,
        default: "",
      },
    },
    required: ["pattern"],
  },
  execute: grepTool,
});
