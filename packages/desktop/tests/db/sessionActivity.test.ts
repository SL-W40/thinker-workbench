/**
 * 侧栏活动时间：末条消息 createdAt。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { activityAtFromMessages } from "../../src/db/sessionActivity";

describe("activityAtFromMessages", () => {
  it("returns max createdAt", () => {
    assert.equal(
      activityAtFromMessages([{ createdAt: 100 }, { createdAt: 300 }, { createdAt: 200 }], 1),
      300,
    );
  });

  it("falls back when empty or invalid", () => {
    assert.equal(activityAtFromMessages([], 42), 42);
    assert.equal(activityAtFromMessages([{ createdAt: NaN }, {}], 7), 7);
  });
});
