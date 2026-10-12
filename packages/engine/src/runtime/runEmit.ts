/**
 * 图节点在一次 run 内的轻量事件出口（status / token / tool）。
 *
 * 节点不直接碰 EventBus，只调 getRunEmitter()；
 * AgentRuntime 用 runWithContext 包住整次图遍历，并由 bindRuntimeEmitter
 * 补上 threadId / runId / sessionId / ts，转成完整 AgentEvent。
 *
 * 真相在 RunContext；模块级 fallback 仅兼容无 ALS 的遗留路径。
 */
import type {
  AgentEvent,
  AgentEventBase,
  AgentModelHealthEvent,
  AgentModelSwitchEvent,
  AgentSubagentEvent,
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
  | Omit<AgentModelSwitchEvent, keyof AgentEventBase>
  | Omit<AgentModelHealthEvent, keyof AgentEventBase>
  | Omit<AgentSubagentEvent, keyof AgentEventBase>;

export type RunEmitter = (event: RunEmitEvent) => void;

/** 无 ALS 时的遗留 fallback（不应在并行 run 路径使用）。 */
let fallbackEmit: RunEmitter | null = null;
let fallbackIds: { threadId: string; runId: string; sessionId?: string } | null = null;

/** 供 agent / tools 节点取当前 run 的发射器。 */
export function getRunEmitter(): RunEmitter | null {
  return getRunContext()?.emit ?? fallbackEmit;
}

/** 当前 run 标识；不在 run 内时为 null。 */
export function getRunIds(): { threadId: string; runId: string; sessionId?: string } | null {
  const ctx = getRunContext();
  if (ctx) {
    return { threadId: ctx.threadId, runId: ctx.runId, sessionId: ctx.sessionId };
  }
  return fallbackIds;
}

/** @deprecated 用 getRunIds().sessionId；保留别名。 */
export function getChatSessionId(): string | undefined {
  return getRunIds()?.sessionId;
}

/**
 * @deprecated 并行安全路径请用 runWithContext；本函数仅嵌套兼容。
 * 在 work 执行期间设置 fallback emitter。
 */
export async function withRunEmitter<T>(emit: RunEmitter, work: () => Promise<T>): Promise<T> {
  const prev = fallbackEmit;
  fallbackEmit = emit;
  try {
    return await work();
  } finally {
    fallbackEmit = prev;
  }
}

/**
 * 把节点侧的精简事件绑成带线程 / 运行 id 的完整 AgentEvent。
 */
export function bindRuntimeEmitter(
  emit: (event: AgentEvent) => void,
  threadId: string,
  runId: string,
  sessionId?: string,
): RunEmitter {
  fallbackIds = { threadId, runId, sessionId };
  return (event) => {
    fallbackIds = { threadId, runId, sessionId };
    // 工具事件自带 sessionId=终端 id，勿覆盖；聊天会话用 chatSessionId
    emit({
      ...event,
      ...(sessionId ? { chatSessionId: sessionId } : {}),
      threadId,
      runId,
      ts: Date.now(),
    } as AgentEvent);
  };
}
