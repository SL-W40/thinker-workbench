/**
 * run 发射器只读 ALS；不在 run 内时为空。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { getRunEmitter, getRunIds } from "../../src/runtime/runEmit";

describe("getRunIds", () => {
  it("ALS 之外返回 null", () => {
    assert.equal(getRunIds(), null);
    assert.equal(getRunEmitter(), null);
  });
});
