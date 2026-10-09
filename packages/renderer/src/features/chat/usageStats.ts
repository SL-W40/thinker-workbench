/**
 * 会话级 token / 耗时累计与展示格式化。
 */
import type { ModelUsage } from "@thinker-workbench/shared";

/** 空用量。 */
export const EMPTY_USAGE: ModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
};

/**
 * 按 chars/4 粗估 token；与 Context Usage / engine `estimateTokens` 一致。
 * 非精确 tokenizer，仅供中断或官方 usage 未回时展示。
 */
export function estimateTokens(text: string): number {
  const n = text.length;
  if (n <= 0) return 0;
  return Math.ceil(n / 4);
}

/**
 * 用已流出的正文 / 思考（及可选可见历史）粗估一条 ModelUsage。
 * 中断时流末包 usage 常未到达，靠此兜底。
 */
export function estimatePartialUsage(parts: {
  reply?: string;
  thinking?: string;
  /** 可见历史文本，粗估 input（不含 system / tools）。 */
  inputTexts?: Iterable<string>;
}): ModelUsage {
  const reasoningTokens = estimateTokens(parts.thinking ?? "");
  const replyTok = estimateTokens(parts.reply ?? "");
  let inputTokens = 0;
  if (parts.inputTexts) {
    for (const t of parts.inputTexts) {
      inputTokens += estimateTokens(t);
    }
  }
  return {
    inputTokens,
    outputTokens: reasoningTokens + replyTok,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens,
  };
}

/** 会话累计统计。 */
export type SessionUsageStats = {
  usage: ModelUsage;
  /** 已结束各轮累计耗时（ms）。 */
  durationMs: number;
};

export function emptySessionUsage(): SessionUsageStats {
  return { usage: { ...EMPTY_USAGE }, durationMs: 0 };
}

/** 累加一次模型 usage。 */
export function addUsage(base: ModelUsage, delta: ModelUsage): ModelUsage {
  return {
    inputTokens: base.inputTokens + delta.inputTokens,
    outputTokens: base.outputTokens + delta.outputTokens,
    cacheReadTokens: base.cacheReadTokens + delta.cacheReadTokens,
    cacheWriteTokens: base.cacheWriteTokens + delta.cacheWriteTokens,
    reasoningTokens: base.reasoningTokens + delta.reasoningTokens,
  };
}

/** 总计 tokens。 */
export function totalTokens(usage: ModelUsage): number {
  return usage.inputTokens + usage.outputTokens;
}

/** 缓存未命中（输入中除去命中与写入）。 */
export function cacheMissTokens(usage: ModelUsage): number {
  return Math.max(0, usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens);
}

/** 回复正文 tokens（输出减去思考）。 */
export function replyTokens(usage: ModelUsage): number {
  return Math.max(0, usage.outputTokens - usage.reasoningTokens);
}

/**
 * 缓存命中率：命中 / (命中 + 未命中 + 写入)。
 * 分母为 0 时返回 null。
 */
export function cacheHitRate(usage: ModelUsage): number | null {
  const miss = cacheMissTokens(usage);
  const denom = usage.cacheReadTokens + miss + usage.cacheWriteTokens;
  if (denom <= 0) return null;
  return usage.cacheReadTokens / denom;
}

/** 千分位数字。 */
export function formatTokenCount(n: number, locale?: string): string {
  return n.toLocaleString(locale || undefined);
}

/** 紧凑 token 文案：1.2K / 3.4M。 */
export function formatCompactTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) n = 0;
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  const m = n / 1_000_000;
  return `${m >= 10 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, "")}M`;
}

/** 耗时：45s / 8m 23s / 1h 2m。 */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (m > 0) {
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return `${s}s`;
}

/** 命中率百分比文案。 */
export function formatHitRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}
