/**
 * maxParallelRuns 规范化与默认值。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  DEFAULT_MAX_PARALLEL_RUNS,
  DEFAULT_MAX_QUEUED_RUNS,
  DEFAULT_QUEUE_TIMEOUT_MIN,
  normalizeGeneral,
  normalizeMaxParallelRuns,
  normalizeMaxQueuedRuns,
  normalizeQueueTimeoutMin,
} from "../../src/ipc/general";

describe("maxParallelRuns", () => {
  it("默认值为 3", () => {
    assert.equal(normalizeGeneral({}).maxParallelRuns, DEFAULT_MAX_PARALLEL_RUNS);
    assert.equal(DEFAULT_MAX_PARALLEL_RUNS, 3);
  });

  it("夹到 1～10", () => {
    assert.equal(normalizeMaxParallelRuns(0), 1);
    assert.equal(normalizeMaxParallelRuns(99), 10);
    assert.equal(normalizeMaxParallelRuns(4.7), 4);
    assert.equal(normalizeMaxParallelRuns("x"), DEFAULT_MAX_PARALLEL_RUNS);
  });

  it("磁盘缺字段保留默认；显式值生效", () => {
    assert.equal(normalizeGeneral({}).maxParallelRuns, 3);
    assert.equal(normalizeGeneral({ maxParallelRuns: 5 }).maxParallelRuns, 5);
  });
});

describe("排队深度与超时", () => {
  it("缺字段用默认 8 与 10 分钟", () => {
    const general = normalizeGeneral({});
    assert.equal(general.maxQueuedRuns, DEFAULT_MAX_QUEUED_RUNS);
    assert.equal(general.queueTimeoutMin, DEFAULT_QUEUE_TIMEOUT_MIN);
    assert.equal(DEFAULT_MAX_QUEUED_RUNS, 8);
    assert.equal(DEFAULT_QUEUE_TIMEOUT_MIN, 10);
  });

  it("只接受设置页上的选项，0 表示关闭", () => {
    assert.equal(normalizeMaxQueuedRuns(0), 0);
    assert.equal(normalizeMaxQueuedRuns(3), DEFAULT_MAX_QUEUED_RUNS);
    assert.equal(normalizeMaxQueuedRuns(16), 16);
    assert.equal(normalizeQueueTimeoutMin(0), 0);
    assert.equal(normalizeQueueTimeoutMin(7), DEFAULT_QUEUE_TIMEOUT_MIN);
    assert.equal(normalizeQueueTimeoutMin(30), 30);
    assert.equal(normalizeGeneral({ maxQueuedRuns: 0, queueTimeoutMin: 0 }).maxQueuedRuns, 0);
    assert.equal(normalizeGeneral({ maxQueuedRuns: 0, queueTimeoutMin: 0 }).queueTimeoutMin, 0);
  });
});
