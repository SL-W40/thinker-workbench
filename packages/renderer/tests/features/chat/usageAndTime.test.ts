/**
 * 侧栏相对时间与用量文案。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { formatRelativeTime } from "../../../src/features/chat/formatRelativeTime";
import { subagentDisplayTitle } from "../../../src/features/chat/subagentTitle";
import {
  addUsage,
  cacheHitRate,
  cacheMissTokens,
  EMPTY_USAGE,
  formatCompactTokens,
  formatDurationOrDash,
  formatElapsed,
  formatHitRate,
  formatUsageTokens,
  replyTokens,
  totalTokens,
} from "../../../src/features/chat/usageStats";

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-10-14T00:00:00Z");

  it("从刚刚到跨周日期", () => {
    assert.equal(formatRelativeTime(now + 5_000, now), "now");
    assert.equal(formatRelativeTime(now - 30_000, now), "now");
    assert.equal(formatRelativeTime(now - 5 * 60_000, now), "5m");
    assert.equal(formatRelativeTime(now - 3 * 3_600_000, now), "3h");
    assert.equal(formatRelativeTime(now - 2 * 86_400_000, now), "2d");
    const older = formatRelativeTime(Date.parse("2026-01-03T00:00:00Z"), now);
    assert.match(older, /^\d+\/\d+$/);
  });
});

describe("usage stats", () => {
  it("累加、命中率与紧凑文案", () => {
    const sum = addUsage(EMPTY_USAGE, {
      inputTokens: 10,
      outputTokens: 6,
      cacheReadTokens: 4,
      cacheWriteTokens: 2,
      reasoningTokens: 1,
    });
    assert.equal(totalTokens(sum), 16);
    assert.equal(cacheMissTokens(sum), 4);
    assert.equal(replyTokens(sum), 5);
    assert.equal(cacheHitRate(sum), 0.4);
    assert.equal(cacheHitRate(EMPTY_USAGE), null);
    assert.equal(formatHitRate(null), "—");
    assert.equal(formatHitRate(0.5), "50.0%");
    assert.equal(formatCompactTokens(Number.NaN), "0");
    assert.equal(formatCompactTokens(999), "999");
    assert.equal(formatCompactTokens(1500), "1.5K");
    assert.equal(formatCompactTokens(12_000), "12K");
    assert.equal(formatCompactTokens(1_500_000), "1.5M");
    assert.equal(formatElapsed(-1), "0s");
    assert.equal(formatElapsed(45_000), "45s");
    assert.equal(formatElapsed(8 * 60_000 + 23_000), "8m 23s");
    assert.equal(formatElapsed(3_600_000), "1h");
    assert.equal(formatElapsed(3_600_000 + 120_000), "1h 2m");
  });

  it("不足 1 秒展示 <1s，避免把 968ms 显示成 0s", () => {
    assert.equal(formatElapsed(1), "<1s");
    assert.equal(formatElapsed(968), "<1s");
    assert.equal(formatElapsed(999), "<1s");
    assert.equal(formatElapsed(1_000), "1s");
  });

  it("耗时未知展示「—」，绝不冒充 0s", () => {
    assert.equal(formatDurationOrDash(undefined), "—");
    assert.equal(formatDurationOrDash(null), "—");
    assert.equal(formatDurationOrDash(Number.NaN), "—");
    assert.equal(formatDurationOrDash(-5), "—");
    assert.equal(formatDurationOrDash(0), "0s");
    assert.equal(formatDurationOrDash(968), "<1s");
    assert.equal(formatDurationOrDash(65_000), "1m 5s");
  });

  it("Tokens 胶囊：未知显示「—」，估算加 ~ 前缀", () => {
    assert.equal(formatUsageTokens(undefined), "—");
    assert.equal(formatUsageTokens(null), "—");
    assert.equal(formatUsageTokens(Number.NaN), "—");
    assert.equal(formatUsageTokens(-1), "—");
    assert.equal(formatUsageTokens(0), "0");
    assert.equal(formatUsageTokens(1_234), "1,234");
    assert.equal(formatUsageTokens(1_234, true), "~1,234");
  });
});

describe("subagentDisplayTitle", () => {
  it("优先 title，占位省略号不当名字", () => {
    assert.equal(subagentDisplayTitle({ title: " 查日志 ", subagent: "explore" }), "查日志");
    assert.equal(subagentDisplayTitle({ title: "  ", subagent: "explore" }), "explore");
    assert.equal(subagentDisplayTitle({ subagent: "…" }), "Task");
    assert.equal(subagentDisplayTitle({ subagent: "  " }), "Task");
  });
});
