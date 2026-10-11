/**
 * Agent 进程：向主进程上报 Trace span（截断由 Main 统一做）。
 * 面向「追踪树」：parentSpanId 必须反映真实调用链；并行 Task 用 AsyncLocalStorage
 * 隔离 taskId / 独立栈，避免全局 LIFO 把 A 的工具挂到 B 下。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import {
  createSpanId,
  type TraceSpanKind,
  type TraceSource,
  type TraceSpanStatus,
} from "@thinker-workbench/shared";
import { postToParent } from "../host/port";

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
/** 主会话（非 Task 内部）span 栈。 */
const mainSpanStack: string[] = [];
/** 每个 Task 独立的 span 栈。 */
const taskSpanStacks = new Map<string, string[]>();
/** task 栈空时的锚点 parent（一般为 tool:Task span）。 */
const taskRootParent = new Map<string, string>();
/**
 * 按异步调用链绑定当前 taskId。
 * 并行 background Task 各自 Promise 树互不干扰，不再用全局 LIFO nest。
 */
const taskAls = new AsyncLocalStorage<TaskAlsStore>();

function clearAllStacks(): void {
  mainSpanStack.length = 0;
  taskSpanStacks.clear();
  taskRootParent.clear();
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
  if (!taskId) return mainSpanStack;
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
function isTaskToolLaunch(input: { name: string; kind: TraceSpanKind }): boolean {
  return input.kind === "tool" && /^tool:Task$/i.test(input.name.trim());
}

/** 同步本轮 Trace 上下文（UtilityHost / AgentRuntime 调用）。 */
export function configureAgentTrace(next: Partial<TraceContext>): void {
  const prevRun = ctx.runId;
  ctx = { ...ctx, ...next };
  // 新 run 清空栈，避免串 run / 并行残留污染 parent
  if (next.runId !== undefined && next.runId !== prevRun) {
    clearAllStacks();
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
  parentSpanId?: string;
  taskId?: string;
  name: string;
  kind: TraceSpanKind;
  source?: TraceSource;
  summary?: string;
  attrs?: Record<string, unknown>;
  input?: unknown;
  sessionId?: string;
  runId?: string;
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
  const stack = taskLaunch ? mainSpanStack : activeSpanStack();
  const taskId = input.taskId ?? (taskLaunch ? undefined : alsTask);

  let parentSpanId = input.parentSpanId;
  // 并发后台 Task：兄弟 tool:Task 都挂 graph.tools，禁止互相嵌套
  if (!parentSpanId && taskLaunch && ctx.nodeSpanId) {
    parentSpanId = ctx.nodeSpanId;
  }
  if (!parentSpanId && stack.length > 0) {
    parentSpanId = stack[stack.length - 1];
  }
  if (!parentSpanId && taskId && !taskLaunch) {
    parentSpanId = taskRootParent.get(taskId);
  }
  if (!parentSpanId) {
    parentSpanId = ctx.parentSpanId;
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
      spanId,
      sessionId,
      runId: input.runId ?? ctx.runId,
      traceId: input.traceId ?? ctx.traceId,
      parentSpanId,
      taskId,
      name: input.name,
      kind: input.kind,
      source: input.source ?? "agent",
      status: "running",
      startTs,
      summary,
      attrs: {
        ...(input.attrs ?? {}),
        ...(ctx.threadId ? { threadId: ctx.threadId } : {}),
        ...(ctx.workspaceId ? { workspaceId: ctx.workspaceId } : {}),
        ...(ctx.title ? { title: ctx.title } : {}),
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
  if (!tryPop(mainSpanStack)) {
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
