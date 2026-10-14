/**
 * 快捷键录制标记：按 webContents id 进出，销毁时清掉。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  clearShortcutRecording,
  isShortcutRecording,
  setShortcutRecording,
} from "../../src/config/shortcutRecording";

describe("shortcutRecording", () => {
  it("进入后为真，退出或销毁后为假", () => {
    assert.equal(isShortcutRecording(7), false);
    setShortcutRecording(7, true);
    assert.equal(isShortcutRecording(7), true);
    setShortcutRecording(7, false);
    assert.equal(isShortcutRecording(7), false);
    setShortcutRecording(8, true);
    clearShortcutRecording(8);
    assert.equal(isShortcutRecording(8), false);
  });
});
