/**
 * autoCompact 编排器：micro → session → full 三级串联，并带连续失败熔断。
 *
 * - micro 永远执行（纯截断，零 LLM）；
 * - 若 micro 后仍超预算且有 chat，依次尝试 session / full（LLM 摘要）；
 * - 任一 LLM 层连续失败达上限则打开熔断，此后仅退化到 micro；
 * - 深度压缩（session/full）创建 TraceRunType="memory" 的 span。
 */

import { agentEndSpan, agentStartSpan } from "../../trace/emit";
import type { ChatFn, ContextBudget, MemoryTraceIds } from "../repository";
import { fullCompact } from "./full";
import { type MicroOptions, microCompact } from "./micro";
import { sessionCompact } from "./session";
import type { CompactionLayer, CompactResult } from "./types";

export interface AutoCompactDeps {
  /** LLM 补全（session/full 摘要用）；缺失时仅能 micro。 */
  chat?: ChatFn;
  /** trace 标识（深度压缩 span 用）。 */
  trace?: MemoryTraceIds;
  /** micro 参数。 */
  micro?: MicroOptions;
  /** 连续失败多少次后打开熔断（默认 3）。 */
  maxFailures?: number;
  onCompact?: (info: CompactResult) => void;
  onError?: (msg: string) => void;
  onCircuitBroken?: () => void;
}

export class AutoCompactor {
  private failures = 0;
  private breakerOpen = false;
  private readonly deps: AutoCompactDeps & { maxFailures: number };

  constructor(deps: AutoCompactDeps) {
    this.deps = { maxFailures: 3, ...deps };
  }

  get isBreakerOpen(): boolean {
    return this.breakerOpen;
  }

  /** 若预算要求压缩则执行；否则返回 null。 */
  async maybeCompact(
    messages: Parameters<typeof microCompact>[0],
    budget: ContextBudget,
  ): Promise<CompactResult | null> {
    if (!budget.shouldCompact(messages)) return null;

    const microMessages = microCompact(messages, this.deps.micro);
    let current = microMessages;
    let result: CompactResult = {
      messages: microMessages,
      layer: "micro",
      before: messages.length,
      after: microMessages.length,
      truncated: messages.length - microMessages.length,
    };

    // micro 已满足预算 → 仅 micro
    if (!budget.shouldCompact(microMessages)) {
      this.deps.onCompact?.(result);
      return result;
    }
    // 无 chat 或已熔断 → 退化到 micro
    if (!this.deps.chat || this.breakerOpen) {
      this.deps.onCompact?.(result);
      return result;
    }

    const layers: CompactionLayer[] = ["session", "full"];
    for (const layer of layers) {
      if (!budget.shouldCompact(current)) break;
      const spanId = this.startSpan(layer);
      try {
        const res =
          layer === "session"
            ? await sessionCompact(current, this.deps.chat, {})
            : await fullCompact(current, this.deps.chat, {});
        this.endSpan(spanId, { status: "ok", output: `after=${res.after}` });
        current = res.messages;
        result = res;
        this.failures = 0;
        this.breakerOpen = false;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.endSpan(spanId, { status: "error", error: msg });
        this.deps.onError?.(msg);
        this.failures += 1;
        if (this.failures >= this.deps.maxFailures && !this.breakerOpen) {
          this.breakerOpen = true;
          this.deps.onCircuitBroken?.();
        }
        break; // 保留 micro / 已成功的层级结果
      }
    }

    this.deps.onCompact?.(result);
    return result;
  }

  private startSpan(layer: CompactionLayer): string | null {
    const trace = this.deps.trace;
    if (!trace) return null;
    try {
      return agentStartSpan({
        name: "memory.compact",
        runType: "memory",
        source: "agent",
        sessionId: trace.sessionId,
        traceId: trace.traceId,
        agentRunId: trace.agentRunId,
        attrs: { kind: "compact", layer },
      });
    } catch {
      return null;
    }
  }

  private endSpan(spanId: string | null, patch: Parameters<typeof agentEndSpan>[1]): void {
    if (!spanId) return;
    try {
      agentEndSpan(spanId, patch);
    } catch {
      /* ignore */
    }
  }
}
