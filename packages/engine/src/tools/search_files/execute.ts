/**
 * search_files 实现：把简易 glob 编成正则，遍历文件路径做匹配。
 * 无斜杠的 pattern 会自动加上「双星号 + 斜杠」前缀，便于按文件名搜。
 */
import path from "node:path";
import { globToRegExp } from "../shared/glob";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted, walkFiles } from "../shared/walk";
import type { ToolArgs, ToolContext } from "../types";

const MAX_HITS = 200;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function searchFilesTool(args: ToolArgs, ctx: ToolContext): Promise<string> {
  const pattern = asString(args.pattern)?.trim() ?? "";
  if (!pattern) {
    throw new Error("search_files requires parameters.pattern (glob, e.g. *.test.ts).");
  }

  const root = resolveWorkspacePath(ctx.workspaceRoot, asString(args.path), { access: "read" });
  const regex = globToRegExp(
    pattern.includes("/") || pattern.includes("\\") || pattern.includes("**")
      ? pattern
      : `**/${pattern}`,
  );
  const hits: string[] = [];

  for await (const file of walkFiles(root, ctx.signal)) {
    throwIfAborted(ctx.signal, "Search files");
    const rel = toWorkspaceRelative(ctx.workspaceRoot, file);
    if (!regex.test(rel) && !regex.test(path.basename(file))) continue;
    hits.push(rel);
    if (hits.length >= MAX_HITS) {
      hits.sort((a, b) => a.localeCompare(b));
      return [
        `path\t${toWorkspaceRelative(ctx.workspaceRoot, root)}`,
        `pattern\t${pattern}`,
        `truncated\ttrue`,
        ...hits,
      ].join("\n");
    }
  }

  hits.sort((a, b) => a.localeCompare(b));
  return [
    `path\t${toWorkspaceRelative(ctx.workspaceRoot, root)}`,
    `pattern\t${pattern}`,
    `truncated\tfalse`,
    ...hits,
  ].join("\n");
}
