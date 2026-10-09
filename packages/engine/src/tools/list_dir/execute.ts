/**
 * list_dir 实现：readdir 一层目录，输出 `kind\tname` 行（dir / file / link）。
 */
import { readdir } from "node:fs/promises";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted } from "../shared/walk";
import type { ToolArgs, ToolContext } from "../types";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function listDirTool(args: ToolArgs, ctx: ToolContext): Promise<string> {
  throwIfAborted(ctx.signal, "List directory");
  const target = resolveWorkspacePath(ctx.workspaceRoot, asString(args.path), { access: "read" });
  const entries = await readdir(target, { withFileTypes: true });
  throwIfAborted(ctx.signal, "List directory");

  const lines = entries
    .map((entry) => {
      const kind = entry.isDirectory() ? "dir" : entry.isSymbolicLink() ? "link" : "file";
      return `${kind}\t${entry.name}`;
    })
    .sort((a, b) => a.localeCompare(b));

  return [`path\t${toWorkspaceRelative(ctx.workspaceRoot, target)}`, ...lines].join("\n");
}
