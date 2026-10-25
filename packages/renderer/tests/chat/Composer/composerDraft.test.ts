/**
 * Composer 草稿存档（composerDraft.ts，jsdom localStorage）。
 */
import assert from "node:assert/strict";
import type { ChatAttachmentRef } from "@thinker-workbench/shared";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  clearComposerDraft,
  flushComposerDrafts,
  loadComposerDraft,
  saveComposerDraft,
} from "../../../src/features/chat/composer/composerDraft";

const KEY = "thinker.composer.draft.v1";

function memoryStorage() {
  const store = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
}

function attachment(id: string): ChatAttachmentRef {
  return {
    id,
    name: `${id}.txt`,
    path: `/tmp/${id}.txt`,
    mime: "text/plain",
    size: 12,
    kind: "document",
  };
}

describe("composerDraft", () => {
  beforeEach(() => {
    memoryStorage();
    vi.useFakeTimers();
    flushComposerDrafts();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("防抖窗口内还没落盘，flush 后同会话可读回", () => {
    saveComposerDraft("s1", { text: "写了一半的话", attachments: [] });
    assert.equal(loadComposerDraft("s1"), null);
    flushComposerDrafts();
    assert.deepEqual(loadComposerDraft("s1"), { text: "写了一半的话", attachments: [] });
  });

  it("等过防抖窗口自动落盘", () => {
    saveComposerDraft("s1", { text: "abc", attachments: [] });
    vi.advanceTimersByTime(250);
    assert.equal(loadComposerDraft("s1")?.text, "abc");
  });

  it("附件引用按形状过滤，保留正文里用到的", () => {
    saveComposerDraft("s1", {
      text: "见 @file:att_ok",
      attachments: [attachment("att_ok"), { id: 42 } as unknown as ChatAttachmentRef],
    });
    flushComposerDrafts();
    assert.deepEqual(
      loadComposerDraft("s1")?.attachments.map((a) => a.id),
      ["att_ok"],
    );
  });

  it("空正文视为撤档（发送后不该再回来）", () => {
    saveComposerDraft("s1", { text: "草稿", attachments: [attachment("att_ok")] });
    flushComposerDrafts();
    saveComposerDraft("s1", { text: "   \n", attachments: [] });
    flushComposerDrafts();
    assert.equal(loadComposerDraft("s1"), null);
  });

  it("clearComposerDraft 只清指定会话", () => {
    saveComposerDraft("s1", { text: "a", attachments: [] });
    saveComposerDraft("s2", { text: "b", attachments: [] });
    flushComposerDrafts();
    clearComposerDraft("s1");
    flushComposerDrafts();
    assert.equal(loadComposerDraft("s1"), null);
    assert.equal(loadComposerDraft("s2")?.text, "b");
  });

  it("会话数超额时丢最旧的", () => {
    for (let i = 0; i < 25; i++) {
      vi.setSystemTime(new Date(1_700_000_000_000 + i * 1000));
      saveComposerDraft(`s${i}`, { text: `d${i}`, attachments: [] });
      flushComposerDrafts();
    }
    const keys = Object.keys(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
    assert.equal(keys.length, 20);
    assert.equal(loadComposerDraft("s0"), null);
    assert.equal(loadComposerDraft("s24")?.text, "d24");
  });

  it("存档损坏 / 无会话 id 时读不到草稿", () => {
    localStorage.setItem(KEY, "{");
    assert.equal(loadComposerDraft("s1"), null);
    assert.equal(loadComposerDraft(null), null);
  });
});
