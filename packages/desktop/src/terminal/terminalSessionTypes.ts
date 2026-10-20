/**
 * PTY / direct 会话的类型（会话记录、等待者、工具结果）。
 */
import type { TerminalSession } from "@thinker-workbench/shared";
import type { IPty } from "node-pty";

/** 工具侧 outcome（对齐 Cursor Await complete | still_running）。 */
export type ShellOutcome = "complete" | "still_running";
export type ShellWakeReason = "exit" | "timeout" | "pattern" | "background";
export type ShellExecMode = "login" | "direct";

export type PtyWaitResult = {
  sessionId: string;
  output: string;
  exitCode: number | null;
  /** 兼容旧字段：outcome === still_running。 */
  backgrounded: boolean;
  outcome: ShellOutcome;
  wakeReason?: ShellWakeReason;
  outputPath?: string;
  outputBytes?: number;
  outputTruncated?: boolean;
  execMode?: ShellExecMode;
};

export type StartAgentCommandOptions = {
  command: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  runId?: string;
  threadId?: string;
  /** 已解析的执行模式（login | direct）。 */
  execMode?: ShellExecMode;
  onSession?: (sessionId: string) => void;
  onData?: (chunk: string) => void;
};

export type WaitAgentCommandOptions = {
  budgetMs: number;
  pattern?: string;
  onData?: (chunk: string) => void;
  requestId?: string;
};

export type ExecOptions = StartAgentCommandOptions & {
  /** 兼容旧 API：启动后立刻 wait。 */
  blockUntilMs?: number;
};

/** 一次 Agent 命令的会话级状态（Source of Truth）。 */
export type AgentShellRun = {
  execMode: ShellExecMode;
  status: "running" | "exited";
  exitCode: number | null;
  finalized: boolean;
  settled: Promise<void>;
  resolveSettled: () => void;
  /** 已向工具返回过的输出游标（相对内存 buffer）。 */
  outputCursor: number;
  /** 绝对路径（主进程 append）。 */
  outputFilePath: string | null;
  /** 回传模型的路径（优先工作区相对，供 read_file）。 */
  outputReportPath: string | null;
  outputBytes: number;
  spilled: boolean;
};

export type SessionWaiter = {
  requestId: string;
  resolve: (result: PtyWaitResult) => void;
  startedAt: number;
  budgetMs: number;
  pattern?: RegExp;
  timer?: ReturnType<typeof setTimeout>;
  onData?: (chunk: string) => void;
};

export type SessionRecord = {
  meta: TerminalSession;
  /** spawn 失败的幽灵会话 / 已退出 direct 无 proc。 */
  proc: IPty | null;
  output: string;
  waiters: SessionWaiter[];
  /** Agent 命令运行态；交互式用户会话为 null。 */
  run: AgentShellRun | null;
};
