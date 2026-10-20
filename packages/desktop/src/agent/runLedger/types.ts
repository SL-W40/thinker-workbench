/**
 * runLedger 类型：终态、轮次内容、账本条目、回调与 begin/settle 载荷。
 */
import type {
  AgentErrorCode,
  AgentResumeCommand,
  AgentRunCommand,
  SessionRunStatus,
} from "@thinker-workbench/shared";
import type { AdmitRunRequest } from "../runCoordinator";

/** settle 终态（与引擎 AgentErrorCode / done 对齐）。 */
export type RunOutcome = "done" | AgentErrorCode;

/** 入队时冻结的轮次内容。模型 / 权限在派发时再读，不写进这里。 */
export type AdmissionTurn =
  | { kind: "run"; command: AgentRunCommand }
  | { kind: "resume"; command: AgentResumeCommand };

/** 出队后交给运输层的一次派发。 */
export type AdmissionDispatchJob = {
  runId: string;
  threadId: string;
  traceId: string;
  sessionId: string;
  workspaceRoot: string;
  workspaceName?: string;
  turn: AdmissionTurn;
  /** 排队等待被调度的时长（毫秒）；随 UtilityRun 下发，engine 并入终态耗时。 */
  queuedMs?: number;
};

export type RunPhase = "queued" | "running";

/** 进行中的账本条目。 */
export type OpenRun = {
  runId: string;
  sessionId: string;
  threadId: string;
  traceId: string;
  titleHint?: string;
  workspaceId: string;
  workspaceRoot: string;
  workspaceName?: string;
  settled: boolean;
  cancelRequested: boolean;
  /** 是否已成功 postMessage 到 utility。 */
  dispatched: boolean;
  phase: RunPhase;
  /** 入队顺序，只增不减。 */
  seq: number;
  /** 入队时刻；仅排队项有值，用于算排队时长。 */
  queuedAt?: number;
  /** 出队时结算的排队时长（毫秒）；随派发下发给 engine。 */
  queuedMs?: number;
  turn?: AdmissionTurn;
  timer?: ReturnType<typeof setTimeout>;
  /** 已经发起过一次派发，避免 pump 与 handler 各 kick 一次。 */
  kickStarted?: boolean;
};

export type BeginRunRequest = AdmitRunRequest & {
  titleHint?: string;
  traceId?: string;
  turn?: AdmissionTurn;
};

export type BeginRunOk = {
  ok: true;
  runId: string;
  threadId: string;
  sessionId: string;
  traceId: string;
  workspaceRoot: string;
  workspaceName?: string;
  /** 为 true 时尚未占并行槽。 */
  queued?: boolean;
  /** FIFO 名次，从 1 起。 */
  queuePosition?: number;
};

export type BeginRunErr = { ok: false; error: string };
export type BeginRunResult = BeginRunOk | BeginRunErr;

export type SettleDetail = {
  error?: string;
  text?: string;
  /** 结算后是否向渲染进程广播合成终态事件（无引擎事件时）。 */
  emitEvent?: boolean;
};

export type Dispatcher = (job: AdmissionDispatchJob) => Promise<void>;
export type AdmissionGate = () => string | null;

export type { SessionRunStatus };
