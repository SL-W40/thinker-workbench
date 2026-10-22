/**
 * list_dir 实现：readdir 一层目录，输出 `kind\tname` 行（dir / file / link）。
 * 条数封顶 MAX_ENTRIES：超限时只返回前 MAX_ENTRIES 条并标记 truncated，
 * 防御万级条目目录把模型上下文打爆。
 */
import { readdir } from "node:fs/promises";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted } from "../shared/walk";
import type { ToolArgs, ToolContext } from "../types";

/** 单次最多返回的目录条目数。 */
const MAX_ENTRIES = 400;

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

  return [
    `path\t${toWorkspaceRelative(ctx.workspaceRoot, target)}`,
    `entries\t${entries.length}`,
    `truncated\t${lines.length > MAX_ENTRIES}`,
    ...lines.slice(0, MAX_ENTRIES),
  ].join("\n");
}
