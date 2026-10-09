/**
 * read_file 工具规格：读取工作区文本文件（可选行区间）。
 * description / parameters 文案面向模型（英文）。
 */
import { defineTool } from "../defineTool";
import { WORKSPACE_PATH_DESCRIPTION } from "../shared/pathParam";
import { readFileTool } from "./execute";

export const readFileToolSpec = defineTool({
  name: "read_file",
  description:
    "Read a text file (paths resolve against environment_context.workspace.root; see workspace.access). Optionally pass start_line and end_line (1-based inclusive) to read a slice; ranged output is line-numbered. Use before edit_file when you need the current text.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: WORKSPACE_PATH_DESCRIPTION,
      },
      start_line: {
        type: "number",
        description:
          "Optional 1-based start line (inclusive). Must be paired with end_line.",
      },
      end_line: {
        type: "number",
        description:
          "Optional 1-based end line (inclusive). Must be paired with start_line.",
      },
      max_chars: {
        type: "number",
        description:
          "Max characters to return when reading without a line range (default 120000). Longer files are truncated.",
        default: 120000,
      },
    },
    required: ["path"],
  },
  execute: readFileTool,
});
