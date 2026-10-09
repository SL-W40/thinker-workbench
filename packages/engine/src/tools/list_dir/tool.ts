/**
 * list_dir 工具规格：列出工作区某目录下的文件与文件夹。
 */
import { defineTool } from "../defineTool";
import { WORKSPACE_PATH_DESCRIPTION } from "../shared/pathParam";
import { listDirTool } from "./execute";

export const listDirToolSpec = defineTool({
  name: "list_dir",
  description:
    "Lists files and folders under a directory (default: environment_context.workspace.root; see workspace.access for absolute paths).",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: WORKSPACE_PATH_DESCRIPTION,
        default: "",
      },
    },
  },
  execute: listDirTool,
});
