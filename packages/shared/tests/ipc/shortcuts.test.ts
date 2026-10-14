/**
 * 快捷键：默认值、规范化、标签、匹配、录制与冲突。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  acceleratorFromKeyboardEvent,
  findShortcutConflict,
  formatAcceleratorLabel,
  getDefaultShortcuts,
  matchAccelerator,
  normalizeAccelerator,
  normalizeShortcuts,
} from "../../src/ipc/shortcuts";

describe("shortcuts", () => {
  it("mac 与 windows 默认导航键不同，脏数据回退默认", () => {
    const mac = getDefaultShortcuts("darwin");
    const win = getDefaultShortcuts("win32");
    assert.equal(mac.navBack, "Mod+[");
    assert.equal(win.navBack, "Alt+ArrowLeft");
    assert.equal(mac.openConsole, "Mod+Comma");
    assert.equal(win.openConsole, "Mod+Shift+J");

    const normalized = normalizeShortcuts(
      { reload: "  F5  ", unknown: "Mod+X", goChat: "" },
      "win32",
    );
    assert.equal(normalized.reload, "F5");
    assert.equal(normalized.goChat, win.goChat);
    assert.deepEqual(normalizeShortcuts(null, "win32"), win);
  });

  it("标签按平台展开 Mod，匹配时 Mod 在非 mac 上是 Ctrl", () => {
    assert.equal(formatAcceleratorLabel("Mod+Shift+Comma", "win32"), "Ctrl+Shift+,");
    assert.equal(formatAcceleratorLabel("Escape", "darwin"), "Esc");
    assert.equal(formatAcceleratorLabel("Alt+ArrowLeft", "darwin"), "⌥←");

    assert.equal(
      matchAccelerator({ key: "r", control: true, type: "keyDown" }, "Mod+R", "win32"),
      true,
    );
    assert.equal(matchAccelerator({ key: "r", meta: true }, "Mod+R", "darwin"), true);
    assert.equal(
      matchAccelerator({ key: "r", control: true, type: "keyUp" }, "Mod+R", "win32"),
      false,
    );
    assert.equal(matchAccelerator({ code: "Comma", control: true }, "Mod+Comma", "win32"), true);
    assert.equal(matchAccelerator({ key: "r" }, "", "win32"), false);
  });

  it("录制把 Ctrl/Cmd 写成 Mod；纯修饰键与无修饰字母丢弃；冲突按规范形式比较", () => {
    assert.equal(
      acceleratorFromKeyboardEvent({
        key: ",",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true,
      }),
      "Mod+Shift+Comma",
    );
    assert.equal(
      acceleratorFromKeyboardEvent({
        key: "Escape",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
      "Escape",
    );
    assert.equal(
      acceleratorFromKeyboardEvent({
        key: "a",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
      null,
    );
    assert.equal(
      acceleratorFromKeyboardEvent({
        key: "Control",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
      null,
    );

    assert.equal(normalizeAccelerator("Ctrl+,"), "Mod+Comma");
    const map = getDefaultShortcuts("win32");
    map.reload = "Mod+N";
    assert.equal(findShortcutConflict("newChat", "Ctrl+n", map), "reload");
    assert.equal(findShortcutConflict("reload", "Mod+N", map), "newChat");
    assert.equal(findShortcutConflict("reload", "   ", map), null);
  });
});
