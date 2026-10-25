/**
 * git_status 实现：只读检视当前仓库状态（分支 / 上下游 / 变更文件）。
 * 输出由桌面侧压缩成文本，这里只做参数校验与截断标记透传。
 */
import { gitInspect } from "../../host/gitClient";
import { throwIfAborted } from "../shared/walk";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";

export async function gitStatusTool(args: ToolArgs, ctx?: ToolContext): Promise<ToolExecuteResult> {
  assertNotAborted(ctx, "git_status");
  const maxChars = typeof args.maxChars === "number" ? args.maxChars : undefined;
  const res = await gitInspect("status", { maxChars }, ctx?.signal);
  assertNotAborted(ctx, "git_status");
  return {
    output: res.truncated
      ? `${res.output}\n(output truncated to fit the context budget)`
      : res.output,
  };
}

/** 无 signal 时不做取消检查（工具也可能在 run 之外被直接调用）。 */
function assertNotAborted(ctx: ToolContext | undefined, label: string): void {
  if (ctx?.signal) throwIfAborted(ctx.signal, label);
}
