/**
 * 会话级 token / 耗时累计与展示格式化。
 *
 * 用量的**数学**（空值、累加、总计、清洗）只有一份实现，在 `shared/protocol/usage.ts`；
 * 这里只保留派生口径（缓存命中、回复 token）与展示格式化，避免两边各算一套。
 */
import {
  addUsage as addUsageShared,
  EMPTY_USAGE as EMPTY_USAGE_SHARED,
  estimateTokens,
  hasUsage,
  type ModelUsage,
  sanitizeUsage,
  totalTokens as totalTokensShared,
} from "@thinker-workbench/shared";

export { estimateTokens, hasUsage, type ModelUsage, sanitizeUsage };
export const EMPTY_USAGE: ModelUsage = { ...EMPTY_USAGE_SHARED };
export const addUsage = addUsageShared;
export const totalTokens = totalTokensShared;

/** 会话累计统计。 */
export type SessionUsageStats = {
  usage: ModelUsage;
  /** 已结束各轮累计耗时（ms）。 */
  durationMs: number;
};

export function emptySessionUsage(): SessionUsageStats {
  return { usage: { ...EMPTY_USAGE }, durationMs: 0 };
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

/**
 * 耗时：45s / 8m 23s / 1h 2m。
 * 不足 1 秒单独成「<1s」：向下取整会把 968ms 显示成 0s，看着像「没跑」。
 */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  if (ms > 0 && ms < 1000) return "<1s";
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

/**
 * 耗时或「—」：未知（缺省 / 非数字）一律展示「—」。
 * 缺失就是缺失，绝不拿 0 冒充，也不从时间线去凑。
 */
export function formatDurationOrDash(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  return formatElapsed(ms);
}

/**
 * Tokens 胶囊文案：未知展示「—」，含粗估成分加 `~` 前缀。
 * 以前 usage 缺失时 `totalTokens(EMPTY_USAGE)` 会画出「0」，看着像真的没消耗——不再这么做。
 */
export function formatUsageTokens(total: number | undefined | null, estimated?: boolean): string {
  if (total == null || !Number.isFinite(total) || total < 0) return "—";
  return `${estimated ? "~" : ""}${formatTokenCount(Math.round(total))}`;
}

/** 命中率百分比文案。 */
export function formatHitRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}
