/**
 * search_files 工具规格：按 glob / 文件名在工作区路径上匹配。
 */
import { defineTool } from "../defineTool";
import { WORKSPACE_PATH_DESCRIPTION } from "../shared/pathParam";
import { searchFilesTool } from "./execute";

export const searchFilesToolSpec = defineTool({
  name: "search_files",
  description:
    "Glob/name match on file paths under a directory resolved against workspace.root (see workspace.access). Example pattern: *.test.ts or **/foo*.ts.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob or file name pattern (e.g. *.test.ts, **/buildGraph.ts).",
      },
      path: {
        type: "string",
        description: `${WORKSPACE_PATH_DESCRIPTION} Searches the whole workspace when empty/omitted.`,
        default: "",
      },
    },
    required: ["pattern"],
  },
  execute: searchFilesTool,
});
