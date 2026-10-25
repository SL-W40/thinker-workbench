/**
 * 图节点在一次 run 内的事件出口。
 * 优先经 LangGraph custom writer；无 writer 时走 RunContext.emit（后台 Task 等）。
 */
import { getWriter } from "@langchain/langgraph";
import type {
  AgentEvent,
  AgentEventBase,
  AgentModelHealthEvent,
  AgentModelSwitchEvent,
  AgentSubagentEvent,
  ChatPlanStatus,
  ChatPlanTodo,
  ChatTodo,
  HitlKind,
  HitlRequest,
  HitlResponse,
} from "@thinker-workbench/shared";
import { getRunContext } from "./runContext";

/** 节点可发的事件（id / 时间戳由 runtime 填充）。 */
export type RunEmitEvent =
  | { type: "token"; text: string; channel?: "reply" | "thinking" }
  | { type: "status"; status: "planning" | "thinking" }
  | {
      type: "tool";
      phase: "start" | "end";
      name: string;
      callId?: string;
      path?: string;
      summary?: string;
      detail?: string;
      ok?: boolean;
      diff?: string;
      sessionId?: string;
      command?: string;
      exitCode?: number | null;
      backgrounded?: boolean;
      restoreContent?: string;
      resultPaths?: string[];
      resultPathKinds?: import("@thinker-workbench/shared").ChatTimelineResultPathKind[];
      /** `todo` 工具：动作与受影响条目（区分读 / 写）。 */
      todo?: import("@thinker-workbench/shared").ChatTimelineTodoHint;
    }
  | {
      type: "usage";
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
        reasoningTokens: number;
      };
    }
  | {
      type: "hitl";
      phase: "request" | "resolved";
      hitlId: string;
      kind: HitlKind;
      request?: HitlRequest;
      response?: HitlResponse;
    }
  | Omit<AgentModelSwitchEvent, keyof AgentEventBase>
  | Omit<AgentModelHealthEvent, keyof AgentEventBase>
  | Omit<AgentSubagentEvent, keyof AgentEventBase>
  | {
      type: "memory";
      phase: "extracted" | "compacted" | "circuit_broken";
      memoryKind?: "project" | "session";
      action?: "init" | "update";
      layer?: "micro" | "session" | "full";
      sections?: string[];
      before?: number;
      after?: number;
      truncated?: number;
    }
  | {
      type: "plan";
      /**
       * `drafting`：create_plan 参数流式中的草稿；
       * `created`：新计划覆盖会话活跃计划；`updated`：执行阶段更新状态 / 待办。
       */
      phase: "drafting" | "created" | "updated";
      /** 计划 id，与 ChatPlan.id 对齐。 */
      planId: string;
      /** 草稿阶段挂到对应工具调用的 id。 */
      callId?: string;
      /** 计划标题；`updated` 时可省略（沿用既有标题）。 */
      title?: string;
      /** 计划简述；`updated` 时可省略（沿用既有简述）。 */
      description?: string;
      status: ChatPlanStatus;
      /** 全量待办列表（幂等替换）。 */
      todos: ChatPlanTodo[];
      markdown?: string;
    }
  | {
      type: "todo";
      /** 全量会话待办（幂等替换）。 */
      todos: ChatTodo[];
      /** 触发来源，供时间线给出不同文案。 */
      origin?: "todo" | "create_plan" | "update_plan";
    };

export type RunEmitter = (event: RunEmitEvent) => void;

/** 供 agent / tools 节点取当前 run 的发射器。 */
export function getRunEmitter(): RunEmitter | null {
  return getRunContext()?.emit ?? null;
}

/** 当前 run 标识；不在 run 内时为 null。 */
export function getRunIds(): { threadId: string; runId: string; sessionId?: string } | null {
  const ctx = getRunContext();
  if (!ctx) return null;
  return { threadId: ctx.threadId, runId: ctx.runId, sessionId: ctx.sessionId };
}

/** RunEmitEvent → 带 base 的 AgentEvent。 */
export function toAgentEvent(base: AgentEventBase, event: RunEmitEvent): AgentEvent {
  switch (event.type) {
    case "token":
      return {
        ...base,
        type: "token",
        text: event.text,
        channel: event.channel ?? "reply",
      };
    case "status":
      return { ...base, type: "status", status: event.status };
    case "tool":
      return {
        ...base,
        type: "tool",
        phase: event.phase,
        name: event.name,
        callId: event.callId,
        path: event.path,
        summary: event.summary,
        detail: event.detail,
        ok: event.ok,
        diff: event.diff,
        sessionId: event.sessionId,
        command: event.command,
        exitCode: event.exitCode,
        backgrounded: event.backgrounded,
        restoreContent: event.restoreContent,
        resultPaths: event.resultPaths,
        resultPathKinds: event.resultPathKinds,
        todo: event.todo,
      };
    case "usage":
      return { ...base, type: "usage", usage: event.usage };
    case "hitl":
      return {
        ...base,
        type: "hitl",
        phase: event.phase,
        hitlId: event.hitlId,
        kind: event.kind,
        request: event.request,
        response: event.response,
      };
    case "model_switch":
      return { ...base, ...event, type: "model_switch" };
    case "model_health":
      return { ...base, ...event, type: "model_health" };
    case "subagent":
      return { ...base, ...event, type: "subagent" };
    case "memory":
      return { ...base, ...event, type: "memory" };
    case "plan":
      return {
        ...base,
        type: "plan",
        phase: event.phase,
        planId: event.planId,
        ...(event.callId ? { callId: event.callId } : {}),
        ...(event.title !== undefined ? { title: event.title } : {}),
        ...(event.description !== undefined ? { description: event.description } : {}),
        status: event.status,
        todos: event.todos,
        ...(event.markdown !== undefined ? { markdown: event.markdown } : {}),
      };
    case "todo":
      return {
        ...base,
        type: "todo",
        todos: event.todos,
        ...(event.origin ? { origin: event.origin } : {}),
      };
  }
}

/**
 * 把节点侧事件绑到当前 run：有 custom writer 则写入流，否则直通 EventBus。
 */
export function bindRuntimeEmitter(
  emit: (event: AgentEvent) => void,
  threadId: string,
  runId: string,
  sessionId?: string,
): RunEmitter {
  const base: AgentEventBase = {
    threadId,
    runId,
    ts: 0,
    ...(sessionId ? { chatSessionId: sessionId } : {}),
  };
  return (event) => {
    const stamped = toAgentEvent({ ...base, ts: Date.now() }, event);
    let writer: ReturnType<typeof getWriter>;
    try {
      writer = getWriter();
    } catch {
      // 不在 LangGraph 节点上下文（无 AsyncLocalStorage）：回退到 EventBus
      writer = undefined;
    }
    if (writer) {
      writer(stamped);
      return;
    }
    emit(stamped);
  };
}
