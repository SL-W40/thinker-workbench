/**
 * Checkpoint 契约助手：保留策略归一与区间钳制（UI 与落盘共用同一口径）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  CHECKPOINT_RETENTION_RANGES,
  DEFAULT_CHECKPOINT_RETENTION,
  normalizeCheckpointRetention,
} from "../../src/ipc/checkpoints";

describe("normalizeCheckpointRetention", () => {
  it("空值 / 非法值回退到默认阈值", () => {
    assert.deepEqual(normalizeCheckpointRetention(null), DEFAULT_CHECKPOINT_RETENTION);
    assert.deepEqual(normalizeCheckpointRetention(undefined), DEFAULT_CHECKPOINT_RETENTION);
  });

  it("未在包内的字段保持默认，已给字段原样采用", () => {
    const next = normalizeCheckpointRetention({ maxRuns: 5 });
    assert.equal(next.maxRuns, 5);
    assert.equal(next.maxAgeDays, DEFAULT_CHECKPOINT_RETENTION.maxAgeDays);
    assert.equal(next.maxTotalBytes, DEFAULT_CHECKPOINT_RETENTION.maxTotalBytes);
  });

  it("越界值被钳制到合法区间", () => {
    const min = CHECKPOINT_RETENTION_RANGES.maxRuns.min;
    const max = CHECKPOINT_RETENTION_RANGES.maxRuns.max;
    assert.equal(normalizeCheckpointRetention({ maxRuns: max + 500 }).maxRuns, max);
    assert.equal(normalizeCheckpointRetention({ maxRuns: 0 }).maxRuns, min);
    assert.equal(normalizeCheckpointRetention({ maxRuns: -3 }).maxRuns, min);
    assert.equal(
      normalizeCheckpointRetention({
        maxAgeDays: CHECKPOINT_RETENTION_RANGES.maxAgeDays.max + 1,
      }).maxAgeDays,
      CHECKPOINT_RETENTION_RANGES.maxAgeDays.max,
    );
  });

  it("非数字与小数按整数处理；0 天表示不按时间裁剪", () => {
    assert.equal(normalizeCheckpointRetention({ maxRuns: 12.8 }).maxRuns, 12);
    assert.equal(normalizeCheckpointRetention({ maxRuns: "abc" as unknown as number }).maxRuns, 30);
    assert.equal(normalizeCheckpointRetention({ maxAgeDays: 0 }).maxAgeDays, 0);
  });

  it("字节字段拒绝负数与 NaN", () => {
    const fallback = DEFAULT_CHECKPOINT_RETENTION.maxFileBytes;
    assert.equal(normalizeCheckpointRetention({ maxFileBytes: -1 }).maxFileBytes, fallback);
    assert.equal(
      normalizeCheckpointRetention({ maxTotalBytes: Number.NaN }).maxTotalBytes,
      DEFAULT_CHECKPOINT_RETENTION.maxTotalBytes,
    );
    assert.equal(normalizeCheckpointRetention({ maxFileBytes: 1024 }).maxFileBytes, 1024);
  });
});
