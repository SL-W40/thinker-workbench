/**
 * 图节点在一次 run 内的轻量事件出口（status / token / tool）。
 *
 * 节点不直接碰 EventBus，只调 getRunEmitter()；
 * AgentRuntime 用 withRunEmitter 包住整次图遍历，并由 bindRuntimeEmitter
 * 补上 threadId / runId / ts，转成完整 AgentEvent。
 *
 * 用模块级 current 做「当前 run」上下文，避免每个节点都显式传 emit。
 */
import type { AgentEvent } from "@thinker-workbench/shared";

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
    };

export type RunEmitter = (event: RunEmitEvent) => void;

/** 当前异步调用栈上的 emitter；不在 withRunEmitter 内时为 null。 */
let current: RunEmitter | null = null;

/** 供 agent / tools 节点取当前 run 的发射器。 */
export function getRunEmitter(): RunEmitter | null {
  return current;
}

/**
 * 在 work 执行期间设置 current emitter，结束后恢复先前值。
 * 支持嵌套（外层 run 被内层临时覆盖时也能还原）。
 */
export async function withRunEmitter<T>(emit: RunEmitter, work: () => Promise<T>): Promise<T> {
  const prev = current;
  current = emit;
  try {
    return await work();
  } finally {
    current = prev;
  }
}

/**
 * 把节点侧的精简事件绑成带线程 / 运行 id 的完整 AgentEvent。
 */
export function bindRuntimeEmitter(
  emit: (event: AgentEvent) => void,
  threadId: string,
  runId: string,
): RunEmitter {
  return (event) => {
    emit({
      ...event,
      threadId,
      runId,
      ts: Date.now(),
    } as AgentEvent);
  };
}
