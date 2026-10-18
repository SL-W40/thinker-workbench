/**
 * 上下文 token 预算。
 *
 * 设计取舍（见方案）：
 * - 真实用量来自 usageLedger（getRunUsage），缺失时回退字符估算；
 * - 上下文窗口来自 getContextWindow()（Settings），未配置回退 128K；
 * - 三级阈值（warning / auto / blocking）驱动压缩与记忆触发。
 */

import { getContextWindow } from "../model/openai";
import type { ChatMessage } from "../model/types";
import { getRunUsage } from "../runtime/runContext";
import type { BudgetLevel, ContextBudget } from "./repository";

/** 占用比例阈值。 */
export type BudgetThresholds = {
  /** 进入 warning 的比例。 */
  warning: number;
  /** 进入 auto（触发自动压缩）的比例。 */
  auto: number;
  /** 进入 blocking（强制 full 压缩 / 丢弃最旧）的比例。 */
  blocking: number;
};

export const DEFAULT_BUDGET_THRESHOLDS: BudgetThresholds = {
  warning: 0.6,
  auto: 0.85,
  blocking: 0.98,
};

/** 预留输出比例（未显式指定时）。 */
const DEFAULT_RESERVE_RATIO = 0.15;

/** 估算消息数组 token 数：字符数 / 4 + 工具调用参数开销。 */
export function estimateMessageTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      chars += m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const p of m.content) {
        if (p.type === "text") chars += p.text.length;
      }
    }
    if (m.tool_calls) {
      for (const tc of m.tool_calls) chars += tc.function.arguments.length;
    }
  }
  return Math.ceil(chars / 4);
}

/** 上下文预算实现。纯逻辑，不依赖 ALS / DB，便于单测。 */
export class ContextBudgetImpl implements ContextBudget {
  readonly contextWindow: number;
  readonly usedInputTokens: number;
  readonly reserveOutputTokens: number;
  private readonly thresholds: BudgetThresholds;

  constructor(opts: {
    contextWindow: number;
    usedInputTokens: number;
    reserveOutputTokens?: number;
    thresholds?: Partial<BudgetThresholds>;
  }) {
    this.contextWindow = Math.max(1, opts.contextWindow);
    this.usedInputTokens = Math.max(0, opts.usedInputTokens);
    this.reserveOutputTokens = Math.max(
      0,
      opts.reserveOutputTokens ?? Math.round(this.contextWindow * DEFAULT_RESERVE_RATIO),
    );
    this.thresholds = { ...DEFAULT_BUDGET_THRESHOLDS, ...(opts.thresholds ?? {}) };
  }

  estimateTokens(messages: ChatMessage[]): number {
    return estimateMessageTokens(messages);
  }

  /** 预计占用比例 = (已用输入 + 当前消息估算 + 预留输出) / 窗口。 */
  ratio(messages: ChatMessage[]): number {
    const projected =
      this.usedInputTokens + this.estimateTokens(messages) + this.reserveOutputTokens;
    return projected / this.contextWindow;
  }

  level(messages: ChatMessage[]): BudgetLevel {
    const r = this.ratio(messages);
    if (r >= this.thresholds.blocking) return "blocking";
    if (r >= this.thresholds.auto) return "auto";
    if (r >= this.thresholds.warning) return "warning";
    return "ok";
  }

  shouldCompact(messages: ChatMessage[]): boolean {
    const lvl = this.level(messages);
    return lvl === "auto" || lvl === "blocking";
  }
}

/**
 * 从运行时构造预算：窗口来自 Settings，已用量来自 usageLedger。
 * 不在 run 内（usage 取不到）时按 0 计。
 */
export function createContextBudgetFromRuntime(opts?: {
  reserveOutputTokens?: number;
  thresholds?: Partial<BudgetThresholds>;
}): ContextBudget {
  const contextWindow = getContextWindow() ?? 128_000;
  const usage = getRunUsage();
  const usedInputTokens = usage ? usage.usage.inputTokens : 0;
  return new ContextBudgetImpl({
    contextWindow,
    usedInputTokens,
    reserveOutputTokens: opts?.reserveOutputTokens,
    thresholds: opts?.thresholds,
  });
}
