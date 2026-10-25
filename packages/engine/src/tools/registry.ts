/**
 * 内置工具注册表（进程内静态 Map）。
 * 新增工具：实现 tool.ts + execute.ts，并在此登记。
 */

import { askUserToolSpec } from "./ask_user/tool";
import {
  browserClickToolSpec,
  browserEvaluateToolSpec,
  browserFillToolSpec,
  browserGetStylesToolSpec,
  browserLockToolSpec,
  browserNavigateToolSpec,
  browserPressKeyToolSpec,
  browserResizeToolSpec,
  browserScreenshotToolSpec,
  browserScrollToolSpec,
  browserSnapshotToolSpec,
  browserTypeToolSpec,
} from "./browser/tool";
import { createPlanToolSpec } from "./create_plan/tool";
import { deleteFileToolSpec } from "./delete_file/tool";
import { editFileToolSpec } from "./edit_file/tool";
import { gitDiffToolSpec } from "./git_diff/tool";
import { gitStatusToolSpec } from "./git_status/tool";
import { grepToolSpec } from "./grep/tool";
import { listDirToolSpec } from "./list_dir/tool";
import { readFileToolSpec } from "./read_file/tool";
import { requestModeSwitchToolSpec } from "./request_mode_switch/tool";
import { searchFilesToolSpec } from "./search_files/tool";
import { shellAwaitToolSpec, shellToolSpec, shellWriteToolSpec } from "./shell/tool";
import { taskAwaitToolSpec, taskCancelToolSpec, taskToolSpec } from "./task/tool";
import { timeToolSpec } from "./time/tool";
import { todoToolSpec } from "./todo/tool";
import { toolSearchToolSpec } from "./toolSearch/tool";
import type { ToolGroup, ToolSpec } from "./types";
import { updatePlanToolSpec } from "./update_plan/tool";
import { writeFileToolSpec } from "./write_file/tool";

/** 给工具打分组标签。分组集中在注册表声明，避免散落到各工具文件。 */
function withGroup(spec: ToolSpec, group: ToolGroup): ToolSpec {
  return { ...spec, group };
}

const tools = new Map<string, ToolSpec>(
  [
    withGroup(readFileToolSpec, "file"),
    withGroup(editFileToolSpec, "file"),
    withGroup(writeFileToolSpec, "file"),
    withGroup(deleteFileToolSpec, "file"),
    withGroup(grepToolSpec, "file"),
    withGroup(listDirToolSpec, "file"),
    withGroup(searchFilesToolSpec, "file"),
    // Git 只读检视：不给模型写操作入口
    withGroup(gitStatusToolSpec, "git"),
    withGroup(gitDiffToolSpec, "git"),
    withGroup(timeToolSpec, "meta"),
    withGroup(updatePlanToolSpec, "plan"),
    withGroup(createPlanToolSpec, "plan"),
    // 待办是会话级能力：任何模式都能规划步骤，不依赖计划
    withGroup(todoToolSpec, "meta"),
    withGroup(askUserToolSpec, "meta"),
    // 模式切换请求：受限模式（Plan / Ask）里由模型发起，用户点卡片确认
    withGroup(requestModeSwitchToolSpec, "meta"),
    withGroup(shellToolSpec, "shell"),
    withGroup(shellAwaitToolSpec, "shell"),
    withGroup(shellWriteToolSpec, "shell"),
    withGroup(taskToolSpec, "task"),
    withGroup(taskAwaitToolSpec, "task"),
    withGroup(taskCancelToolSpec, "task"),
    withGroup(browserNavigateToolSpec, "browser"),
    withGroup(browserLockToolSpec, "browser"),
    withGroup(browserSnapshotToolSpec, "browser"),
    withGroup(browserClickToolSpec, "browser"),
    withGroup(browserTypeToolSpec, "browser"),
    withGroup(browserFillToolSpec, "browser"),
    withGroup(browserPressKeyToolSpec, "browser"),
    withGroup(browserScrollToolSpec, "browser"),
    withGroup(browserEvaluateToolSpec, "browser"),
    withGroup(browserResizeToolSpec, "browser"),
    withGroup(browserGetStylesToolSpec, "browser"),
    withGroup(browserScreenshotToolSpec, "browser"),
    // 延迟加载入口：自身必须常驻，否则模型无法发现任何 MCP 工具
    withGroup(toolSearchToolSpec, "meta"),
  ].map((spec) => [spec.name, spec] as const),
);

/** 按名称取工具；未注册返回 undefined。 */
export function getTool(name: string): ToolSpec | undefined {
  return tools.get(name);
}

/** 列出全部已注册工具规格。 */
export function listTools(): ToolSpec[] {
  return [...tools.values()];
}
