/**
 * shell / shell_await 工具执行体。
 */
import path from "node:path";
import {
  getDefaultShellBlockUntilMs,
  getShellOutputCap,
} from "../../config/runtimeLimits";
import { ptyAwait, ptyExec } from "../../host/ptyClient";
import { getWorkspaceAccess, getWorkspaceRoot } from "../../workspace";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";
import { ensureShellApproved } from "./approve";

/** 截断输出：保留头尾。 */
function truncateOutput(text: string): string {
  const cap = getShellOutputCap();
  if (text.length <= cap) return text;
  const head = Math.floor(cap * 0.4);
  const tail = cap - head - 80;
  return `${text.slice(0, head)}\n\n...[${text.length - head - tail} bytes truncated]...\n\n${text.slice(-tail)}`;
}

/** 解析 cwd：相对 workspace；full 才允许逃出。 */
function resolveCwd(workingDirectory: string | undefined, workspaceRoot: string): string {
  if (!workingDirectory?.trim()) return workspaceRoot;
  const raw = workingDirectory.trim();
  const resolved = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(workspaceRoot, raw);
  const access = getWorkspaceAccess();
  if (access !== "full") {
    const rel = path.relative(workspaceRoot, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(
        `working_directory escapes workspace (access=${access}): ${workingDirectory}`,
      );
    }
  }
  return resolved;
}

/** shell 工具。 */
export async function shellTool(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
  const command = typeof args.command === "string" ? args.command : "";
  if (!command.trim()) throw new Error("command is required.");
  const workingDirectory =
    typeof args.working_directory === "string" ? args.working_directory : undefined;
  const blockUntilMs =
    typeof args.block_until_ms === "number" && Number.isFinite(args.block_until_ms)
      ? Math.max(0, Math.floor(args.block_until_ms))
      : getDefaultShellBlockUntilMs();

  await ensureShellApproved(command, ctx.signal);
  const cwd = resolveCwd(workingDirectory, ctx.workspaceRoot || getWorkspaceRoot());

  const result = await ptyExec(
    {
      command,
      workingDirectory: cwd,
      blockUntilMs,
    },
    ctx.signal,
  );

  const output = truncateOutput(result.output);
  const lines = [
    `sessionId: ${result.sessionId}`,
    `exitCode: ${result.exitCode === null ? "null" : String(result.exitCode)}`,
    `backgrounded: ${result.backgrounded}`,
    "",
    output || "(no output)",
  ];
  const ptyFailed = output.includes("[PTY error]");
  return {
    output: lines.join("\n"),
    ok: !ptyFailed,
    ui: {
      sessionId: result.sessionId,
      command,
      exitCode: result.exitCode,
      backgrounded: result.backgrounded,
    },
  };
}

/** shell_await 工具。 */
export async function shellAwaitTool(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolExecuteResult> {
  const sessionId = typeof args.sessionId === "string" ? args.sessionId.trim() : "";
  if (!sessionId) throw new Error("sessionId is required.");
  const blockUntilMs =
    typeof args.block_until_ms === "number" && Number.isFinite(args.block_until_ms)
      ? Math.max(0, Math.floor(args.block_until_ms))
      : getDefaultShellBlockUntilMs();
  const pattern = typeof args.pattern === "string" ? args.pattern : undefined;

  const result = await ptyAwait(
    { sessionId, blockUntilMs, pattern },
    ctx.signal,
  );

  const output = truncateOutput(result.output);
  const lines = [
    `sessionId: ${result.sessionId}`,
    `exitCode: ${result.exitCode === null ? "null" : String(result.exitCode)}`,
    `backgrounded: ${result.backgrounded}`,
    "",
    output || "(no output)",
  ];
  return {
    output: lines.join("\n"),
    ui: {
      sessionId: result.sessionId,
      exitCode: result.exitCode,
      backgrounded: result.backgrounded,
    },
  };
}
