/**
 * Run 级上下文：由 RunHandle 拥有，经 AsyncLocalStorage 在深层工具栈传输。
 * 模块级 workspace/chatMode/emitter 仅作无 ALS 时的进程默认（hello / contextUsage）。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type {
  ChatMode,
  ModelCatalog,
  ModelSelection,
  ShellApprovalMode,
  ShellProfile,
  WorkspaceAccess,
} from "@thinker-workbench/shared";
import type { RunEmitter } from "./runEmit";

/** 一次 run 拥有的全部可变上下文。 */
export type RunContext = {
  runId: string;
  threadId: string;
  sessionId?: string;
  workspaceRoot: string;
  workspaceName?: string;
  chatMode: ChatMode;
  workspaceAccess: WorkspaceAccess;
  allowAiDeleteFiles: boolean;
  allowAiShell: boolean;
  allowAiBrowser: boolean;
  shellApprovalMode: ShellApprovalMode;
  shellAllowlist: string[];
  shellProfile: ShellProfile | null;
  emit: RunEmitter;
  /** 本 run 的模型目录快照（与进程 baseline 隔离）。 */
  catalog: ModelCatalog | null;
  selection: ModelSelection;
  routeContext: { userText: string; contextPaths?: string[] };
  /** 本 run 挂起的 HITL id。 */
  hitlIds: Set<string>;
  /** 本 run 派生的后台 Task id。 */
  taskIds: Set<string>;
  /**
   * 当前模型/工具轮次（主图 GraphState.step 或子代理 childTurn）。
   * 供 Trace span attrs.turn；可变，在每轮调用前 setRunTurn。
   */
  turn?: number;
};

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
