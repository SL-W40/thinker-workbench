/**
 * computer 动作辅助纯函数（engine/src/mcp/computer/actions.ts）。
 * 既有 `tests/mcp/computer.test.ts` 已覆盖 sendKeys，此处补 toInt / mouseFlags / notWindows。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { mouseFlags, notWindows, toInt } from "../../../src/mcp/computer/actions";

describe("toInt", () => {
  it("rounds finite numbers and numeric strings", () => {
    assert.equal(toInt(3), 3);
    assert.equal(toInt(3.6), 4);
    assert.equal(toInt(" 12 "), 12);
    assert.equal(toInt("-4.4"), -4);
  });

  it("rejects NaN, Infinity, blanks and non-numerics", () => {
    assert.equal(toInt(Number.NaN), null);
    assert.equal(toInt(Number.POSITIVE_INFINITY), null);
    assert.equal(toInt(""), null);
    assert.equal(toInt("  "), null);
    assert.equal(toInt("abc"), null);
    assert.equal(toInt(null), null);
    assert.equal(toInt(undefined), null);
    assert.equal(toInt({}), null);
  });
});

describe("mouseFlags", () => {
  it("maps buttons, defaulting to left", () => {
    assert.deepEqual(mouseFlags("left"), { down: 0x02, up: 0x04 });
    assert.deepEqual(mouseFlags("right"), { down: 0x08, up: 0x10 });
    assert.deepEqual(mouseFlags("middle"), { down: 0x20, up: 0x40 });
    assert.deepEqual(mouseFlags("unknown"), { down: 0x02, up: 0x04 });
  });
});

describe("notWindows", () => {
  it("returns a failed ToolResult", () => {
    assert.deepEqual(notWindows(), {
      ok: false,
      output: "Computer control is only supported on Windows.",
    });
  });
});
