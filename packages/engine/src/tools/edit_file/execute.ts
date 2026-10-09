/**
 * edit_file 实现：在已有文件中做精确字符串替换。
 */
import { readFile, writeFile } from "node:fs/promises";
import { buildUnifiedDiff } from "../shared/diff";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted } from "../shared/walk";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export async function editFileTool(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
  throwIfAborted(ctx.signal, "Edit file");
  const rel = asString(args.path)?.trim();
  if (!rel) {
    throw new Error("edit_file requires parameters.path (workspace-relative).");
  }
  const oldString = asString(args.old_string);
  if (oldString == null || oldString === "") {
    throw new Error("edit_file requires non-empty parameters.old_string.");
  }
  const newString = asString(args.new_string);
  if (newString == null) {
    throw new Error("edit_file requires parameters.new_string (may be empty to delete).");
  }
  if (oldString === newString) {
    throw new Error("edit_file: old_string and new_string are identical.");
  }

  const replaceAll = asBool(args.replace_all, false);
  const target = resolveWorkspacePath(ctx.workspaceRoot, rel, { access: "write" });
  const before = await readFile(target, "utf8");
  throwIfAborted(ctx.signal, "Edit file");

  const count = before.split(oldString).length - 1;
  if (count === 0) {
    throw new Error(
      `edit_file: old_string not found in ${toWorkspaceRelative(ctx.workspaceRoot, target)}.`,
    );
  }
  if (count > 1 && !replaceAll) {
    throw new Error(
      `edit_file: old_string matched ${count} times; set replace_all=true or provide a more unique old_string.`,
    );
  }

  const after = replaceAll
    ? before.split(oldString).join(newString)
    : before.replace(oldString, newString);

  await writeFile(target, after, "utf8");
  throwIfAborted(ctx.signal, "Edit file");

  const pathLabel = toWorkspaceRelative(ctx.workspaceRoot, target);
  const replacements = replaceAll ? count : 1;
  return {
    output: [
      `path\t${pathLabel}`,
      `replacements\t${replacements}`,
      `chars_before\t${before.length}`,
      `chars_after\t${after.length}`,
    ].join("\n"),
    ui: {
      path: pathLabel,
      diff: buildUnifiedDiff(pathLabel, before, after),
    },
  };
}
