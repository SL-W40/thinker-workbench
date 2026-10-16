/**
 * Agent 进程：向主进程上报 Trace span（截断由 Main 统一做）。
 * 面向「追踪树」：parentId 必须反映真实调用链；并行 Task 用 AsyncLocalStorage
 * 隔离 taskId / 独立栈，避免全局 LIFO 把 A 的工具挂到 B 下。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import {
  createSpanId,
  type TraceRunType,
  type TraceSource,
  type TraceSpanStatus,
} from "@thinker-workbench/shared";
import { postToParent } from "../host/port";
import { getRunIds } from "../runtime/runEmit";

type TraceContext = {
  enabled: boolean;
  sessionId?: string;
  workspaceId?: string;
  runId?: string;
  traceId?: string;
  threadId?: string;
  /** 会话标题（写入 span attrs，供列表展示）。 */
  title?: string;
  /** 可选根 parent（会话 Trace 以 graph/model/tool 为根，通常不设）。 */
  parentSpanId?: string;
  /** 当前 graph 节点 span（如 graph.tools），并发 Task 工具挂到这里。 */
  nodeSpanId?: string;
};

type TaskAlsStore = {
  taskId: string;
};

let ctx: TraceContext = { enabled: true };
/** 主会话 span 栈：按 runId 分桶，避免并行 run 互清。 */
const mainSpanStacksByRun = new Map<string, string[]>();
/** 每个 Task 独立的 span 栈。 */
const taskSpanStacks = new Map<string, string[]>();
/** task 栈空时的锚点 parent（一般为 tool:Task span）。 */
const taskRootParent = new Map<string, string>();
/**
 * 按异步调用链绑定当前 taskId。
 * 并行 background Task 各自 Promise 树互不干扰，不再用全局 LIFO nest。
 */
const taskAls = new AsyncLocalStorage<TaskAlsStore>();

function currentRunKey(): string {
  return getRunIds()?.runId ?? ctx.runId ?? "_";
}

function mainSpanStackFor(runId?: string): string[] {
  const key = runId?.trim() || currentRunKey();
  let stack = mainSpanStacksByRun.get(key);
  if (!stack) {
    stack = [];
    mainSpanStacksByRun.set(key, stack);
  }
  return stack;
}

function clearStacksForRun(runId: string): void {
  const key = runId.trim() || "_";
  mainSpanStacksByRun.delete(key);
  // Task 栈仍按 taskId；新 run 开局清自己的主栈即可
}

/** 当前异步链上的 taskId（无则 undefined = 主会话）。 */
export function getActiveAgentTaskId(): string | undefined {
  return taskAls.getStore()?.taskId;
}

/**
 * 当前调用链上的栈顶 span（供 desktop pty/browser/hitl 挂 parent）。
 * Task 栈空时回退到 tool:Task 锚点。
 */
export function peekAgentSpanId(): string | undefined {
  const stack = activeSpanStack();
  if (stack.length > 0) return stack[stack.length - 1];
  const taskId = getActiveAgentTaskId();
  if (taskId) return taskRootParent.get(taskId);
  return ctx.parentSpanId;
}

function spanStackForTask(taskId: string | undefined): string[] {
  if (!taskId) return mainSpanStackFor();
  let stack = taskSpanStacks.get(taskId);
  if (!stack) {
    stack = [];
    taskSpanStacks.set(taskId, stack);
  }
  return stack;
}

function activeSpanStack(): string[] {
  return spanStackForTask(getActiveAgentTaskId());
}

/** 是否为 Task 工具启动 span（必须走主栈，避免并行时挂到另一 Task 内部）。 */
function isTaskToolLaunch(input: { name: string; runType: TraceRunType }): boolean {
  return input.runType === "tool" && /^tool:Task$/i.test(input.name.trim());
}

/** 同步本轮 Trace 上下文（UtilityHost / AgentRuntime 调用）。 */
export function configureAgentTrace(next: Partial<TraceContext>): void {
  const prevRun = ctx.runId;
  ctx = { ...ctx, ...next };
  // 新 run 只清本 run 的主栈，勿动其它并行 run
  if (next.runId !== undefined && next.runId !== prevRun && next.runId) {
    clearStacksForRun(next.runId);
  }
}

export function getAgentTraceContext(): TraceContext {
  return ctx;
}

/**
 * 在绑定了 taskId 的异步上下文中执行（并行 Task 各自调用，互不抢栈）。
 * @param rootParentSpanId 栈空时的 parent（默认沿用已登记的 tool:Task span）
 */
export function runWithAgentTaskId<T>(
  taskId: string,
  fn: () => Promise<T>,
  rootParentSpanId?: string,
): Promise<T> {
  const id = taskId.trim();
  if (!id) return fn();
  if (!taskSpanStacks.has(id)) taskSpanStacks.set(id, []);
  const anchor = rootParentSpanId?.trim();
  if (anchor) taskRootParent.set(id, anchor);
  return taskAls.run({ taskId: id }, fn);
}

function post(msg: Parameters<typeof postToParent>[0]): void {
  try {
    postToParent(msg);
  } catch {
    /* ignore */
  }
}

export type AgentStartSpanInput = {
  spanId?: string;
  parentId?: string;
  taskId?: string;
  name: string;
  runType: TraceRunType;
  source?: TraceSource;
  summary?: string;
  attrs?: Record<string, unknown>;
  input?: unknown;
  sessionId?: string;
  agentRunId?: string;
  traceId?: string;
};

/** 开始 span；无 sessionId 时跳过上报仍返回 id。 */
export function agentStartSpan(input: AgentStartSpanInput): string {
  const spanId = input.spanId ?? createSpanId();
  const sessionId = input.sessionId ?? ctx.sessionId;
  if (!ctx.enabled || !sessionId) return spanId;

  const taskLaunch = isTaskToolLaunch(input);
  const alsTask = getActiveAgentTaskId();
  // Task 工具本身始终挂主栈；内部工作才进 task 栈（由 ALS taskId 决定）
  const stack = taskLaunch ? mainSpanStackFor(input.agentRunId ?? ctx.runId) : activeSpanStack();
  const taskId = input.taskId ?? (taskLaunch ? undefined : alsTask);

  let parentId = input.parentId;
  if (taskLaunch) {
    // 并发 tool:Task 只挂 graph.tools（nodeSpanId），禁止互相嵌套到主栈顶
    if (!parentId) parentId = ctx.nodeSpanId ?? ctx.parentSpanId;
  } else {
    if (!parentId && stack.length > 0) {
      parentId = stack[stack.length - 1];
    }
    if (!parentId && taskId) {
      parentId = taskRootParent.get(taskId);
    }
    if (!parentId) {
      parentId = ctx.parentSpanId;
    }
  }

  const startTs = Date.now();
  stack.push(spanId);
  // 登记 Task 锚点：子代理 / model / tool 栈空时挂到此 span
  if (taskLaunch && input.taskId?.trim()) {
    taskRootParent.set(input.taskId.trim(), spanId);
  }

  const summary = input.summary?.trim() || input.name;
  post({
    channel: "utility",
    kind: "span",
    phase: "start",
    span: {
      id: spanId,
      sessionId,
      agentRunId: input.agentRunId ?? ctx.runId,
      traceId: input.traceId ?? ctx.traceId,
      parentId,
      taskId,
      name: input.name,
      runType: input.runType,
      source: input.source ?? "agent",
      status: "running",
      startTs,
      summary,
      attrs: {
        ...(input.attrs ?? {}),
        ...(ctx.threadId ? { threadId: ctx.threadId } : {}),
        ...(ctx.workspaceId ? { workspaceId: ctx.workspaceId } : {}),
        // 会话标题用独立键，勿覆盖 Task/subagent 的 attrs.title
        ...(ctx.title ? { sessionTitle: ctx.title } : {}),
      },
      input: input.input,
    },
  });
  return spanId;
}

export function agentEndSpan(
  spanId: string,
  patch: {
    status?: TraceSpanStatus;
    summary?: string;
    output?: unknown;
    error?: unknown;
    attrs?: Record<string, unknown>;
  } = {},
): void {
  if (!ctx.enabled || !spanId) return;
  // 按 spanId 从任意栈移除（不依赖 ALS：end 可能与 start 异步边界略有偏差）
  const tryPop = (stack: string[]) => {
    const idx = stack.lastIndexOf(spanId);
    if (idx >= 0) {
      stack.splice(idx, 1);
      return true;
    }
    return false;
  };
  let popped = tryPop(mainSpanStackFor());
  if (!popped) {
    for (const stack of mainSpanStacksByRun.values()) {
      if (tryPop(stack)) {
        popped = true;
        break;
      }
    }
  }
  if (!popped) {
    for (const stack of taskSpanStacks.values()) {
      if (tryPop(stack)) break;
    }
  }
  post({
    channel: "utility",
    kind: "span",
    phase: "end",
    spanId,
    status: patch.status,
    summary: patch.summary,
    output: patch.output,
    error: patch.error,
    attrs: patch.attrs,
    endTs: Date.now(),
  });
}
