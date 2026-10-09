/**
 * delete_file 工具规格：删除文件；目录须 recursive。
 * description / parameters 文案面向模型（英文）。
 */
import { defineTool } from "../defineTool";
import { WORKSPACE_PATH_DESCRIPTION } from "../shared/pathParam";
import { deleteFileTool } from "./execute";

export const deleteFileToolSpec = defineTool({
  name: "delete_file",
  description:
    "Delete a file (paths resolve against environment_context.workspace.root; writes respect workspace.access). For a directory, set recursive=true. Disabled when Settings disallows AI file deletion. Prefer this over emptying a file with write_file when the user asked to remove it.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: WORKSPACE_PATH_DESCRIPTION,
      },
      recursive: {
        type: "boolean",
        description:
          "Required true to delete a directory and its contents. Ignored for regular files. Default false.",
      },
    },
    required: ["path"],
  },
  execute: deleteFileTool,
});
