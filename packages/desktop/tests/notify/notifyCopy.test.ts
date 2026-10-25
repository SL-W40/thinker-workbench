/**
 * 通知文案表：每种语言字段齐全、中英互不相同、未知语言回退默认。
 */
import assert from "node:assert/strict";
import { type AppLocale, DEFAULT_APP_LOCALE } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { notifyCopy } from "../../src/notify/notifyCopy";

const KEYS = [
  "finished",
  "error",
  "attention",
  "previewTitle",
  "previewBody",
  "runCompleted",
] as const;

const LOCALES: AppLocale[] = ["en", "zh"];

describe("notifyCopy", () => {
  it("每种语言都有完整且非空的文案", () => {
    for (const locale of LOCALES) {
      const copy = notifyCopy(locale);
      for (const key of KEYS) {
        assert.equal(typeof copy[key], "string", `${locale}.${key}`);
        assert.ok(copy[key].length > 0, `${locale}.${key} 不应为空串`);
      }
    }
  });

  it("同一语言多次取值一致（文案表不被改写）", () => {
    assert.deepEqual(notifyCopy("zh"), notifyCopy("zh"));
  });

  it("中英文案逐字段不同", () => {
    const en = notifyCopy("en");
    const zh = notifyCopy("zh");
    for (const key of KEYS) {
      assert.notEqual(en[key], zh[key], `${key} 中英相同，疑似漏翻译`);
    }
  });

  it("未知 locale 回退默认语言，而不是返回 undefined", () => {
    const fallback = notifyCopy("nope" as AppLocale);
    assert.deepEqual(fallback, notifyCopy(DEFAULT_APP_LOCALE));
    assert.equal(typeof fallback.finished, "string");
    assert.ok(fallback.finished.length > 0);
  });
});
