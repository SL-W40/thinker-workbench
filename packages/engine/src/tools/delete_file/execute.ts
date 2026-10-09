/**
 * delete_file 实现：删除文件；目录须 recursive=true。
 * 受设置 `allowAiDeleteFiles` 与工作区写权限约束。
 * 普通文件在体积允许时把正文放进 ui.restoreContent，供时间线「恢复」。
 */
import { readFile, rm, stat } from "node:fs/promises";
import { getAllowAiDeleteFiles } from "../../workspace";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted } from "../shared/walk";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";

/** 可缓存以便恢复的最大字节数（按 utf8 字符近似）。 */
const MAX_RESTORE_CHARS = 120_000;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export async function deleteFileTool(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
  throwIfAborted(ctx.signal, "Delete file");
  if (!getAllowAiDeleteFiles()) {
    throw new Error(
      "delete_file is disabled in Settings (Allow AI to delete files). Ask the user to turn it on if deletion is required.",
    );
  }

  const rel = asString(args.path)?.trim();
  if (!rel) {
    throw new Error("delete_file requires parameters.path (workspace-relative).");
  }

  const recursive = asBool(args.recursive, false);
  const target = resolveWorkspacePath(ctx.workspaceRoot, rel, { access: "write" });
  const pathLabel = toWorkspaceRelative(ctx.workspaceRoot, target);

  if (target === ctx.workspaceRoot) {
    throw new Error("delete_file cannot remove the workspace root.");
  }

  let info;
  try {
    info = await stat(target);
  } catch {
    throw new Error(`delete_file: path not found: ${pathLabel}`);
  }

  if (info.isDirectory() && !recursive) {
    throw new Error(
      `delete_file: ${pathLabel} is a directory. Set recursive=true to remove it and its contents.`,
    );
  }

  let restoreContent: string | undefined;
  if (info.isFile() && info.size <= MAX_RESTORE_CHARS) {
    try {
      restoreContent = await readFile(target, "utf8");
    } catch {
      restoreContent = undefined;
    }
  }

  throwIfAborted(ctx.signal, "Delete file");
  await rm(target, { recursive, force: false });

  const kind = info.isDirectory() ? "directory" : "file";
  const meta = [
    `path\t${pathLabel}`,
    `kind\t${kind}`,
    `deleted\ttrue`,
    recursive ? `recursive\ttrue` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    output: meta,
    ui: {
      path: pathLabel,
      ...(restoreContent !== undefined ? { restoreContent } : {}),
    },
  };
}
