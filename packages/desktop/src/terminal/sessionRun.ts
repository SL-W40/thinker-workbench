/**
 * 会话运行态：AgentShellRun 构造、增量输出取值与工具结果组装（纯逻辑，可单测）。
 */
import { parseDoneExitCode, stripDoneMarkers } from "./shellMarkers";
import type {
  AgentShellRun,
  PtyWaitResult,
  SessionRecord,
  ShellExecMode,
  ShellWakeReason,
} from "./terminalSessionTypes";

/** 构造一次 Agent 命令的运行态。 */
export function createRun(execMode: ShellExecMode): AgentShellRun {
  let resolveSettled: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });
  return {
    execMode,
    status: "running",
    exitCode: null,
    finalized: false,
    settled,
    resolveSettled,
    outputCursor: 0,
    outputFilePath: null,
    outputReportPath: null,
    outputBytes: 0,
    spilled: false,
  };
}

/** 取游标之后的增量输出（并推进游标）。 */
export function takeIncrementalOutput(rec: SessionRecord): string {
  const run = rec.run;
  if (!run) return stripDoneMarkers(rec.output);
  const raw = rec.output.slice(run.outputCursor);
  run.outputCursor = rec.output.length;
  return stripDoneMarkers(raw);
}

/** 已完成：带 exitCode 与落盘信息。 */
export function completeResult(rec: SessionRecord, wakeReason: ShellWakeReason): PtyWaitResult {
  const exitCode = rec.run?.exitCode ?? parseDoneExitCode(rec.output) ?? rec.meta.exitCode ?? null;
  const output = takeIncrementalOutput(rec);
  return {
    sessionId: rec.meta.sessionId,
    output,
    exitCode,
    backgrounded: false,
    outcome: "complete",
    wakeReason,
    outputPath: rec.run?.outputReportPath ?? rec.run?.outputFilePath ?? undefined,
    outputBytes: rec.run?.outputBytes,
    outputTruncated: Boolean(rec.run?.spilled),
    execMode: rec.run?.execMode,
  };
}

/** 仍在跑：backgrounded / still_running。 */
export function stillRunningResult(rec: SessionRecord, wakeReason: ShellWakeReason): PtyWaitResult {
  const output = takeIncrementalOutput(rec);
  return {
    sessionId: rec.meta.sessionId,
    output,
    exitCode: null,
    backgrounded: true,
    outcome: "still_running",
    wakeReason,
    outputPath: rec.run?.outputReportPath ?? rec.run?.outputFilePath ?? undefined,
    outputBytes: rec.run?.outputBytes,
    outputTruncated: Boolean(rec.run?.spilled),
    execMode: rec.run?.execMode,
  };
}
