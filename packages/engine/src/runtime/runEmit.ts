/**
 * 图节点在一次 run 内的轻量事件出口（status / token / tool）。
 *
 * 节点不直接碰 EventBus，只调 getRunEmitter()；
 * AgentRuntime 用 runWithContext 包住整次图遍历，并由 bindRuntimeEmitter
 * 补上 threadId / runId / sessionId / ts，转成完整 AgentEvent。
 *
 * 发射器与 run 标识只从 RunContext（ALS）读取；不在 run 内时为 null。
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

/**
 * 把节点侧的精简事件绑成带线程 / 运行 id 的完整 AgentEvent。
 */
export function bindRuntimeEmitter(
  emit: (event: AgentEvent) => void,
  threadId: string,
  runId: string,
  sessionId?: string,
): RunEmitter {
  return (event) => {
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
