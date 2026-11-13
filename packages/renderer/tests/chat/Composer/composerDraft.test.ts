/**
 * Composer 草稿本地存档冒烟测试（Vitest）。
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  clearComposerDraft,
  flushComposerDrafts,
  loadComposerDraft,
  saveComposerDraft,
} from "../../../src/features/chat/composer/composerDraft";

const STORAGE_KEY = "thinker.composer.draft.v1";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  flushComposerDrafts();
  localStorage.clear();
});

describe("composerDraft", () => {
  it("写入后可读回正文", () => {
    saveComposerDraft("s1", { text: "写了一半的话" });
    flushComposerDrafts();
    assert.deepEqual(loadComposerDraft("s1"), { text: "写了一半的话" });
  });

  it("空正文会撤档", () => {
    saveComposerDraft("s1", { text: "abc" });
    flushComposerDrafts();
    saveComposerDraft("s1", { text: "   \n" });
    flushComposerDrafts();
    assert.equal(loadComposerDraft("s1"), null);
  });

  it("clear 后不可读", () => {
    saveComposerDraft("s1", { text: "草稿" });
    flushComposerDrafts();
    clearComposerDraft("s1");
    flushComposerDrafts();
    assert.equal(loadComposerDraft("s1"), null);
  });

  it("多会话互不覆盖", () => {
    saveComposerDraft("s1", { text: "a" });
    saveComposerDraft("s2", { text: "b" });
    flushComposerDrafts();
    assert.equal(loadComposerDraft("s1")?.text, "a");
    assert.equal(loadComposerDraft("s2")?.text, "b");
  });

  it("超过上限时淘汰最旧会话", () => {
    for (let i = 0; i < 25; i++) {
      saveComposerDraft(`s${i}`, { text: `d${i}` });
      flushComposerDrafts();
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    assert.ok(raw);
    const store = JSON.parse(raw) as Record<string, unknown>;
    assert.ok(Object.keys(store).length <= 20);
  });
});
