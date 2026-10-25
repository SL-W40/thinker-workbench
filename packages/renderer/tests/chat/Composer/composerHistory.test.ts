/**
 * Composer 撤销 / 重做快捷键与历史栈。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  ComposerHistory,
  composerHistoryAction,
} from "../../../src/features/chat/composer/composerHistory";

describe("composerHistoryAction", () => {
  const base = { altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, key: "z" };

  it("Ctrl+Z 与 ⌘Z 都是撤销", () => {
    assert.equal(composerHistoryAction({ ...base, ctrlKey: true }), "undo");
    assert.equal(composerHistoryAction({ ...base, metaKey: true }), "undo");
  });

  it("Ctrl+Shift+Z、⌘⇧Z、Ctrl+Y 是重做", () => {
    assert.equal(composerHistoryAction({ ...base, ctrlKey: true, shiftKey: true }), "redo");
    assert.equal(composerHistoryAction({ ...base, metaKey: true, shiftKey: true }), "redo");
    assert.equal(composerHistoryAction({ ...base, key: "y", ctrlKey: true }), "redo");
  });

  it("没有修饰键或带 Alt 时不拦截", () => {
    assert.equal(composerHistoryAction(base), null);
    assert.equal(composerHistoryAction({ ...base, ctrlKey: true, altKey: true }), null);
  });
});

describe("ComposerHistory", () => {
  it("撤销回到编辑前，重做再回来", () => {
    const history = new ComposerHistory();
    history.checkpoint("", 0);
    history.checkpoint("a", 1);
    const undone = history.undo({ text: "ab", caret: 2 });
    assert.deepEqual(undone, { text: "a", caret: 1 });
    const redone = history.redo({ text: "a", caret: 1 });
    assert.deepEqual(redone, { text: "ab", caret: 2 });
  });

  it("新的编辑清掉重做栈", () => {
    const history = new ComposerHistory();
    history.checkpoint("a", 1);
    history.undo({ text: "ab", caret: 2 });
    history.checkpoint("a", 1);
    assert.equal(history.redo({ text: "ac", caret: 2 }), null);
  });

  it("空栈撤销返回 null", () => {
    const history = new ComposerHistory();
    assert.equal(history.undo({ text: "", caret: 0 }), null);
  });
});
