/**
 * Run 级上下文：由 RunHandle 拥有，经 AsyncLocalStorage 在深层工具栈传输。
 * 模块级 workspace/chatMode/emitter 仅作无 ALS 时的进程默认（hello / contextUsage）。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type {
  ChatMode,
  ModelCatalog,
  ModelSelection,
  ModelUsage,
  ShellApprovalMode,
  ShellProfile,
  WorkspaceAccess,
} from "@thinker-workbench/shared";
import type { RuntimeLimits } from "../config/runtimeLimits";
import type { MemoryRepository } from "../memory/repository";
import type { RunEmitter } from "./runEmit";
import { bookUsage, createUsageLedger, type RunUsageLedger } from "./usageLedger";

/** 一次 run 拥有的全部可变上下文。 */
export type RunContext = {
  runId: string;
  threadId: string;
  sessionId?: string;
  workspaceRoot: string;
  workspaceName?: string;
  /** 本 run 的数据目录（记忆 SQLite 等落盘处）。 */
  dataDir?: string;
  /** 记忆仓库（会话抽取记忆持久化）；未注入时记忆退化为仅运行时。 */
  memoryRepository?: MemoryRepository;
  chatMode: ChatMode;
  workspaceAccess: WorkspaceAccess;
  allowAiDeleteFiles: boolean;
  allowAiShell: boolean;
  allowAiBrowser: boolean;
  shellApprovalMode: ShellApprovalMode;
  shellAllowlist: string[];
  /** 本轮硬拒绝首 token；先于审批模式生效。 */
  shellBlocklist: string[];
  shellProfile: ShellProfile | null;
  emit: RunEmitter;
  /** 本 run 生效的限额快照（桌面随 UtilityRun 下发）；读取走 getLimit()。 */
  limits: RuntimeLimits;
  /** 本 run 的模型目录快照（与进程 baseline 隔离）。 */
  catalog: ModelCatalog | null;
  selection: ModelSelection;
  routeContext: { userText: string; contextPaths?: string[]; hasImages?: boolean };
  /**
   * 本 run 的用量账本（含子代理：派生帧**共享同一引用**，勿重置成新对象）。
   * 入账走 `addRunUsage()`，由唯一模型调用卡口 `chatWithFailover` 调用。
   */
  usage: RunUsageLedger;
  /** 本 run 挂起的 HITL id。 */
  hitlIds: Set<string>;
  /** 本 run 派生的后台 Task id。 */
  taskIds: Set<string>;
  /**
   * 当前模型/工具轮次（主图 GraphState.step 或子代理 childTurn）。
   * 供 Trace span attrs.turn；可变，在每轮调用前 setRunTurn。
   */
  turn?: number;
  /**
   * 本 run 是否由新用户消息发起（run() 为 true，resume() 为 false）。
   * 供会话记忆注入的话题切换防护：新消息首轮剥离历史任务摘要。
   */
  freshUserTurn: boolean;
  /**
   * 工具开工前落盘 callId（供 resume 防重放）。
   * 由 AgentRuntime.runLoop 绑定；无 ALS / 测试可不设。
   */
  markToolCallStarted?: (callId: string) => Promise<void>;
};

/** 调用当前 run 的开工落盘钩子（无钩子则 no-op）。 */
export async function markToolCallStarted(callId: string): Promise<void> {
  const id = callId?.trim();
  if (!id) return;
  const fn = als.getStore()?.markToolCallStarted;
  if (fn) await fn(id);
}

const als = new AsyncLocalStorage<RunContext>();

/** 当前异步链上的 RunContext；不在 run 内为 undefined。 */
export function getRunContext(): RunContext | undefined {
  return als.getStore();
}

/** 写入当前 run 的轮次（供 model.chat / tool span）。 */
export function setRunTurn(turn: number): void {
  const ctx = als.getStore();
  if (ctx) ctx.turn = turn;
}

/**
 * 入账一次模型调用的用量（唯一入口）。
 * 不在 run 内（无 ALS，如 hello / contextUsage 探测）时静默跳过——用量只归属 run。
 */
export function addRunUsage(delta: ModelUsage | undefined, estimated = false): void {
  const ledger = als.getStore()?.usage;
  if (!ledger) return;
  bookUsage(ledger, delta, estimated);
}

/** 读取当前 run 的用量账本（不在 run 内为 undefined）。 */
export function getRunUsage(): RunUsageLedger | undefined {
  return als.getStore()?.usage;
}

export type { RunUsageLedger };
/** 新建一份账本（构造 RunContext 时用）。 */
export { createUsageLedger };

/** 读取当前轮次。 */
export function getRunTurn(): number | undefined {
  const turn = als.getStore()?.turn;
  return typeof turn === "number" && Number.isFinite(turn) && turn > 0
    ? Math.floor(turn)
    : undefined;
}

/** 在 ctx 作用域内执行 work（支持嵌套覆盖）。 */
export function runWithContext<T>(ctx: RunContext, work: () => Promise<T>): Promise<T> {
  return als.run(ctx, work);
}

/** 同步版（极少用）。 */
export function runWithContextSync<T>(ctx: RunContext, work: () => T): T {
  return als.run(ctx, work);
}
