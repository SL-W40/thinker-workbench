/**
 * write_file 工具规格：创建 / 整文件覆盖，或按行区间替换。
 * description / parameters 文案面向模型（英文）。
 */
import { defineTool } from "../defineTool";
import { WORKSPACE_PATH_DESCRIPTION } from "../shared/pathParam";
import { writeFileTool } from "./execute";

export const writeFileToolSpec = defineTool({
  name: "write_file",
  description:
    "Create a new file or overwrite an existing file (paths resolve against environment_context.workspace.root; writes respect workspace.access). Prefer edit_file for small localized edits. To replace a line span, pass start_line and end_line (1-based inclusive) with contents for that span (empty contents deletes the span).",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: WORKSPACE_PATH_DESCRIPTION,
      },
      contents: {
        type: "string",
        description:
          "Full file contents when no line range is set; or the replacement text for start_line..end_line when a range is set.",
      },
      start_line: {
        type: "number",
        description:
          "Optional 1-based start line (inclusive) for span replace. Must be paired with end_line. File must already exist.",
      },
      end_line: {
        type: "number",
        description:
          "Optional 1-based end line (inclusive) for span replace. Must be paired with start_line.",
      },
    },
    required: ["path", "contents"],
  },
  execute: writeFileTool,
});
