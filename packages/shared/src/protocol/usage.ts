/**
 * token 用量的唯一数学实现。
 *
 * 以前 renderer 有一份私有实现（`features/chat/usageStats.ts`）、engine 一份都没有，
 * 于是「谁该累加、累加出来是多少」两边各说各话。这里收敛成一份，engine / renderer /
 * desktop 全部复用：入账用它、落库校验用它、展示格式化也用它。
 *
 * 约定：`ModelUsage` 五个字段都是非负整数；任何来源（网关回包、DB payload、IPC）
 * 在进入累加之前都必须过一遍 `sanitizeUsage`。
 */
import type { ModelUsage } from "../ipc/events";

export type { ModelUsage };

/** 空用量（全 0）。 */
export const EMPTY_USAGE: ModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
};

/** 把任意值归一为合法非负整数；非法 / 缺失一律 0。 */
function nonNegInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * 清洗一份用量：非对象、NaN、负数、小数、缺失字段全部归一。
 * @returns 合法 `ModelUsage`；入参不可用时返回 `undefined`（保留「未知」语义，不补 0）。
 */
export function sanitizeUsage(raw: unknown): ModelUsage | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const u = raw as Record<string, unknown>;
  if (
    typeof u.inputTokens !== "number" &&
    typeof u.outputTokens !== "number" &&
    typeof u.cacheReadTokens !== "number" &&
    typeof u.cacheWriteTokens !== "number" &&
    typeof u.reasoningTokens !== "number"
  ) {
    return undefined;
  }
  return {
    inputTokens: nonNegInt(u.inputTokens),
    outputTokens: nonNegInt(u.outputTokens),
    cacheReadTokens: nonNegInt(u.cacheReadTokens),
    cacheWriteTokens: nonNegInt(u.cacheWriteTokens),
    reasoningTokens: nonNegInt(u.reasoningTokens),
  };
}

/** 逐字段相加（不修改入参）。 */
export function addUsage(base: ModelUsage, delta: ModelUsage): ModelUsage {
  return {
    inputTokens: base.inputTokens + delta.inputTokens,
    outputTokens: base.outputTokens + delta.outputTokens,
    cacheReadTokens: base.cacheReadTokens + delta.cacheReadTokens,
    cacheWriteTokens: base.cacheWriteTokens + delta.cacheWriteTokens,
    reasoningTokens: base.reasoningTokens + delta.reasoningTokens,
  };
}

/** 计入展示口径的总 token（输入 + 输出）。 */
export function totalTokens(usage: ModelUsage): number {
  return usage.inputTokens + usage.outputTokens;
}

/** 是否有任何用量（用于「显示数值」还是「显示「—」」）。 */
export function hasUsage(usage: ModelUsage | undefined | null): boolean {
  return usage != null && totalTokens(usage) > 0;
}
