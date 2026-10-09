/**
 * edit_file 工具规格：精确替换已有文件中的片段。
 * description / parameters 文案面向模型（英文）。
 */
import { defineTool } from "../defineTool";
import { WORKSPACE_PATH_DESCRIPTION } from "../shared/pathParam";
import { editFileTool } from "./execute";

export const editFileToolSpec = defineTool({
  name: "edit_file",
  description:
    "Make a precise edit by replacing old_string with new_string (paths resolve against environment_context.workspace.root; writes respect workspace.access). Fails if old_string is missing or matches more than once (unless replace_all=true). Prefer this over write_file for localized changes. For line-span replacement, use write_file with start_line/end_line.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: WORKSPACE_PATH_DESCRIPTION,
      },
      old_string: {
        type: "string",
        description:
          "Exact text to find in the file (must uniquely identify the edit unless replace_all).",
      },
      new_string: {
        type: "string",
        description: "Replacement text. Use empty string to delete the matched span.",
      },
      replace_all: {
        type: "boolean",
        description: "If true, replace every occurrence of old_string. Default false.",
        default: false,
      },
    },
    required: ["path", "old_string", "new_string"],
  },
  execute: editFileTool,
});
