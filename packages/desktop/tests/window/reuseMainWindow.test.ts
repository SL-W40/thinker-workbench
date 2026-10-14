/**
 * 主窗复用：已有存活实例则聚焦，销毁或空则交还 null。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { type ReusableMainWindow, reuseMainWindowIfAlive } from "../../src/window/reuseMainWindow";

function fakeWin(opts: { destroyed?: boolean; minimized?: boolean }): ReusableMainWindow & {
  restoreCalls: number;
  showCalls: number;
  focusCalls: number;
} {
  const win = {
    restoreCalls: 0,
    showCalls: 0,
    focusCalls: 0,
    isDestroyed: () => Boolean(opts.destroyed),
    isMinimized: () => Boolean(opts.minimized),
    restore: () => {
      win.restoreCalls += 1;
    },
    show: () => {
      win.showCalls += 1;
    },
    focus: () => {
      win.focusCalls += 1;
    },
  };
  return win;
}

describe("reuseMainWindowIfAlive", () => {
  it("null / 已销毁 → null，且不调用聚焦", () => {
    assert.equal(reuseMainWindowIfAlive(null), null);
    assert.equal(reuseMainWindowIfAlive(undefined), null);
    const dead = fakeWin({ destroyed: true });
    assert.equal(reuseMainWindowIfAlive(dead), null);
    assert.equal(dead.showCalls, 0);
  });

  it("存活窗口 → 复用并 show/focus", () => {
    const win = fakeWin({});
    assert.equal(reuseMainWindowIfAlive(win), win);
    assert.equal(win.restoreCalls, 0);
    assert.equal(win.showCalls, 1);
    assert.equal(win.focusCalls, 1);
  });

  it("最小化时先 restore 再 show/focus", () => {
    const win = fakeWin({ minimized: true });
    assert.equal(reuseMainWindowIfAlive(win), win);
    assert.equal(win.restoreCalls, 1);
    assert.equal(win.showCalls, 1);
    assert.equal(win.focusCalls, 1);
  });
});
