/**
 * Chromium 自带的页面缩放快捷键识别（界面缩放改由设置驱动）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  chromiumZoomDirection,
  isChromiumZoomAccelerator,
  stepUiFontScale,
  type ZoomKeyInput,
} from "../../src/window/uiZoom";

function key(partial: Partial<ZoomKeyInput> & Pick<ZoomKeyInput, "key">): ZoomKeyInput {
  return { type: "keyDown", ...partial };
}

describe("isChromiumZoomAccelerator", () => {
  it("Windows / Linux：Ctrl + +/-/0 和小键盘是缩放键", () => {
    assert.equal(isChromiumZoomAccelerator(key({ key: "=", control: true }), "win32"), true);
    assert.equal(
      isChromiumZoomAccelerator(key({ key: "+", control: true, shift: true }), "linux"),
      true,
    );
    assert.equal(isChromiumZoomAccelerator(key({ key: "-", control: true }), "win32"), true);
    assert.equal(isChromiumZoomAccelerator(key({ key: "0", control: true }), "win32"), true);
    assert.equal(
      isChromiumZoomAccelerator(key({ key: "Add", code: "NumpadAdd", control: true }), "win32"),
      true,
    );
  });

  it("macOS：Cmd 才是缩放键，Ctrl 不是", () => {
    assert.equal(isChromiumZoomAccelerator(key({ key: "=", meta: true }), "darwin"), true);
    assert.equal(isChromiumZoomAccelerator(key({ key: "0", meta: true }), "darwin"), true);
    assert.equal(isChromiumZoomAccelerator(key({ key: "=", control: true }), "darwin"), false);
  });

  it("普通按键、带 Alt、以及 Ctrl+Shift+0 不拦截", () => {
    assert.equal(isChromiumZoomAccelerator(key({ key: "r", control: true }), "win32"), false);
    assert.equal(
      isChromiumZoomAccelerator(key({ key: "=", control: true, alt: true }), "win32"),
      false,
    );
    assert.equal(
      isChromiumZoomAccelerator(key({ key: "0", control: true, shift: true }), "win32"),
      false,
    );
    assert.equal(
      isChromiumZoomAccelerator(key({ key: "=", control: true, type: "keyUp" }), "win32"),
      true,
    );
    assert.equal(
      isChromiumZoomAccelerator(
        key({ key: "Unidentified", code: "Equal", control: true }),
        "win32",
      ),
      true,
    );
    assert.equal(
      isChromiumZoomAccelerator(key({ key: "=", control: true, type: "char" }), "win32"),
      false,
    );
  });
});

describe("chromiumZoomDirection / stepUiFontScale", () => {
  it("Ctrl+= 放大，Ctrl+- 缩小，Ctrl+0 回到 100%", () => {
    assert.equal(chromiumZoomDirection(key({ key: "=", control: true }), "win32"), 1);
    assert.equal(chromiumZoomDirection(key({ key: "-", control: true }), "win32"), -1);
    assert.equal(chromiumZoomDirection(key({ key: "0", control: true }), "win32"), 0);
    assert.equal(chromiumZoomDirection(key({ key: "=", control: true, type: "keyUp" }), "win32"), null);
  });

  it("每次 5%，夹在 80% 到 125%", () => {
    assert.equal(stepUiFontScale(1, 1), 1.05);
    assert.equal(stepUiFontScale(1, -1), 0.95);
    assert.equal(stepUiFontScale(0.85, 0), 1);
    assert.equal(stepUiFontScale(1.25, 1), 1.25);
    assert.equal(stepUiFontScale(0.8, -1), 0.8);
  });
});
