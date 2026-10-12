/**
 * maxParallelRuns 规范化与默认值。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  DEFAULT_MAX_PARALLEL_RUNS,
  normalizeGeneral,
  normalizeMaxParallelRuns,
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
