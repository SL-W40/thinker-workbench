/**
 * list_dir 实现：readdir 一层目录，输出 `kind\tname` 行（dir / file / link）。
 * 条数封顶 MAX_ENTRIES：超限时只返回前 MAX_ENTRIES 条并标记 truncated，
 * 防御万级条目目录把模型上下文打爆。
 * 同时把条目路径写进 ui.resultPaths，供时间线展开列表。
 */
import { readdir } from "node:fs/promises";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted } from "../shared/walk";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";

/** 单次最多返回的目录条目数。 */
const MAX_ENTRIES = 400;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function listDirTool(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
  throwIfAborted(ctx.signal, "List directory");
  const target = resolveWorkspacePath(ctx.workspaceRoot, asString(args.path), { access: "read" });
  const entries = await readdir(target, { withFileTypes: true });
  throwIfAborted(ctx.signal, "List directory");

  const items = entries
    .map((entry) => ({
      kind: entry.isDirectory()
        ? ("dir" as const)
        : entry.isSymbolicLink()
          ? ("link" as const)
          : ("file" as const),
      name: entry.name,
    }))
    // 与原 `kind\tname` 行排序一致：先按 kind 再按 name
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

  const shown = items.slice(0, MAX_ENTRIES);
  const dirRel = toWorkspaceRelative(ctx.workspaceRoot, target);
  const entryPath = (name: string) => (dirRel === "." ? name : `${dirRel}/${name}`);

  return {
    output: [
      `path\t${dirRel}`,
      `entries\t${entries.length}`,
      `truncated\t${items.length > MAX_ENTRIES}`,
      ...shown.map((item) => `${item.kind}\t${item.name}`),
    ].join("\n"),
    ui: {
      resultPaths: shown.map((item) => entryPath(item.name)),
      resultPathKinds: shown.map((item) => item.kind),
    },
  };
}
