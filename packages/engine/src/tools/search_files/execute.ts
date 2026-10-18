/**
 * search_files 实现：把简易 glob 编成正则，遍历文件路径做匹配。
 * 无斜杠的 pattern 会自动加上「双星号 + 斜杠」前缀，便于按文件名搜。
 */
import path from "node:path";
import { globToRegExp } from "../shared/glob";
import { resolveWorkspacePath, toWorkspaceRelative } from "../shared/paths";
import { throwIfAborted, walkFiles } from "../shared/walk";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";

const MAX_HITS = 200;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function searchFilesTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
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
  let truncated = false;

  for await (const file of walkFiles(root, ctx.signal)) {
    throwIfAborted(ctx.signal, "Search files");
    const rel = toWorkspaceRelative(ctx.workspaceRoot, file);
    if (!regex.test(rel) && !regex.test(path.basename(file))) continue;
    hits.push(rel);
    if (hits.length >= MAX_HITS) {
      truncated = true;
      break;
    }
  }

  hits.sort((a, b) => a.localeCompare(b));
  return {
    output: [
      `path\t${toWorkspaceRelative(ctx.workspaceRoot, root)}`,
      `pattern\t${pattern}`,
      `truncated\t${truncated}`,
      ...hits,
    ].join("\n"),
    // 命中文件列表：时间线展开/直跳用（不进模型上下文）
    ui: {
      resultPaths: hits,
      resultPathKinds: hits.map(() => "file" as const),
    },
  };
}
