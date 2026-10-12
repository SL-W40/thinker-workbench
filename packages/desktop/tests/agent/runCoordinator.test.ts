/**
 * RunCoordinator 默认并行上限（实际值读自 GeneralSettings）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { DEFAULT_MAX_PARALLEL_RUNS } from "@thinker-workbench/shared";
import { MAX_PARALLEL_RUNS } from "../../src/agent/runCoordinator";

describe("RunCoordinator 默认并行上限", () => {
  it("出厂默认与 shared 一致为 3", () => {
    assert.equal(MAX_PARALLEL_RUNS, DEFAULT_MAX_PARALLEL_RUNS);
    assert.equal(DEFAULT_MAX_PARALLEL_RUNS, 3);
  });
});
