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
    "Read a text file (paths resolve against environment_context.workspace.root; see workspace.access). Do not guess path: only use a path returned by search_files or grep in this turn, or one the user explicitly gave. Optionally pass start_line and/or end_line (1-based inclusive) to read a slice; ranged output is line-numbered. Omitting end_line reads to EOF; omitting start_line starts at line 1. end_line past EOF is clamped. Use before edit_file when you need the current text.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: `${WORKSPACE_PATH_DESCRIPTION} Must be a known path (from search_files / grep this turn, or the user) — do not invent.`,
      },
      start_line: {
        type: "number",
        description:
          "Optional 1-based start line (inclusive). Alone: read from here to EOF. With end_line: inclusive slice.",
      },
      end_line: {
        type: "number",
        description:
          "Optional 1-based end line (inclusive). Alone: read lines 1..end. Past EOF is clamped to the last line.",
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
