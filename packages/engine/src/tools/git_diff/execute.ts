/**
 * git_diff 实现：只读检视改动内容。
 * 不给 `paths` 时取工作树全部改动的 patch（受桌面侧文件数上限保护）。
 */
import { gitInspect } from "../../host/gitClient";
import { throwIfAborted } from "../shared/walk";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";

/** 单次最多请求多少个文件。 */
const MAX_PATHS = 20;

function readPaths(args: ToolArgs): string[] | undefined {
  const raw = args.paths;
  if (!Array.isArray(raw)) return undefined;
  const paths = raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    // 防止模型塞绝对路径或越界路径进来
    .filter((p) => !p.startsWith("/") && !p.startsWith("../") && !/^[a-zA-Z]:/.test(p));
  return paths.length > 0 ? paths.slice(0, MAX_PATHS) : undefined;
}

/** 无 signal 时跳过取消检查（工具也可能在 run 之外被直接调用）。 */
function assertNotAborted(ctx: ToolContext | undefined, label: string): void {
  if (ctx?.signal) throwIfAborted(ctx.signal, label);
}

export async function gitDiffTool(args: ToolArgs, ctx?: ToolContext): Promise<ToolExecuteResult> {
  assertNotAborted(ctx, "git_diff");
  const paths = readPaths(args);
  const contextLines =
    typeof args.contextLines === "number" && Number.isFinite(args.contextLines)
      ? Math.max(0, Math.min(30, Math.floor(args.contextLines)))
      : undefined;
  const maxChars = typeof args.maxChars === "number" ? args.maxChars : undefined;
  const res = await gitInspect("diff", { paths, contextLines, maxChars }, ctx?.signal);
  assertNotAborted(ctx, "git_diff");
  return {
    output: res.truncated
      ? `${res.output}\n(output truncated — narrow it down with parameters.paths)`
      : res.output,
  };
}
