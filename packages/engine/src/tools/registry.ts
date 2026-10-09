/**
 * 内置工具注册表（进程内静态 Map）。
 * 新增工具：实现 tool.ts + execute.ts，并在此登记。
 */
import { deleteFileToolSpec } from "./delete_file/tool";
import { editFileToolSpec } from "./edit_file/tool";
import { grepToolSpec } from "./grep/tool";
import { listDirToolSpec } from "./list_dir/tool";
import { readFileToolSpec } from "./read_file/tool";
import { searchFilesToolSpec } from "./search_files/tool";
import { timeToolSpec } from "./time/tool";
import type { ToolSpec } from "./types";
import { writeFileToolSpec } from "./write_file/tool";

const tools = new Map<string, ToolSpec>([
  [readFileToolSpec.name, readFileToolSpec],
  [editFileToolSpec.name, editFileToolSpec],
  [writeFileToolSpec.name, writeFileToolSpec],
  [deleteFileToolSpec.name, deleteFileToolSpec],
  [grepToolSpec.name, grepToolSpec],
  [listDirToolSpec.name, listDirToolSpec],
  [searchFilesToolSpec.name, searchFilesToolSpec],
  [timeToolSpec.name, timeToolSpec],
]);

/** 按名称取工具；未注册返回 undefined。 */
export function getTool(name: string): ToolSpec | undefined {
  return tools.get(name);
}

/** 列出全部已注册工具规格。 */
export function listTools(): ToolSpec[] {
  return [...tools.values()];
}
