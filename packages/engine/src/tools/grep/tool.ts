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
    "Regex search over text file contents under a path resolved against workspace.root (see workspace.access). Skips node_modules/.git/etc. Locator, not a reader: each hit is `path:line:content`; long lines are clipped (`…[+N chars]`) — read a full line with read_file using its line number. Caps: 100 hits and 20 per file (files/count modes: 100 files); total_matches counts matches found until the scan stopped. When truncated, narrow with path or glob and search again.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "JavaScript regular expression to match against each line. Pass a short literal or simple regex.",
      },
      path: {
        type: "string",
        description: `${WORKSPACE_PATH_DESCRIPTION} Searches the whole workspace when empty/omitted.`,
        default: "",
      },
      glob: {
        type: "string",
        description:
          "Optional glob filtering which files are searched, matched against the workspace-relative path or the file name (e.g. *.ts, src/**/*.tsx). Omit to search all text files.",
      },
      output_mode: {
        type: "string",
        description:
          "content (default): matching lines as path:line:content. files: only matching file paths. count: per-file match counts as `path<TAB>count`.",
        default: "content",
      },
      ignore_case: {
        type: "boolean",
        description: "Case-insensitive match (equivalent to grep -i). Default false.",
      },
    },
    required: ["pattern"],
  },
  execute: grepTool,
});
