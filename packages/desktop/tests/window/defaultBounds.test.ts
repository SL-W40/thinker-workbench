/**
 * 首启窗口在小屏上的最小尺寸。Electron screen 不在这个进程里，完整贴屏另说。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { windowMinSize } from "../../src/window/defaultBounds";

describe("windowMinSize", () => {
  it("大屏用首选下限，小屏降到工作区，但不少于绝对下限", () => {
    assert.deepEqual(windowMinSize(1920, 1080), { minWidth: 720, minHeight: 520 });
    assert.deepEqual(windowMinSize(400, 300), { minWidth: 400, minHeight: 300 });
    assert.deepEqual(windowMinSize(100, 100), { minWidth: 320, minHeight: 280 });
  });
});
