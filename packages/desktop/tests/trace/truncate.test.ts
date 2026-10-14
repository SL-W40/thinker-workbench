/**
 * Trace 载荷截断与脱敏。循环引用会让 walk 无限递归，这里不覆盖那条路径。
 */
import assert from "node:assert/strict";
import type { GeneralSettings } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { limitsFromGeneral, type TruncateLimits, truncateForTrace } from "../../src/trace/truncate";

function limits(partial: Partial<TruncateLimits> = {}): TruncateLimits {
  return {
    truncateEnabled: true,
    maxFieldBytes: 32,
    maxPayloadBytes: 10_000,
    maxMessageChars: 5,
    maxHistoryMessages: 3,
    captureBinary: "meta",
    redactKeys: ["apiKey"],
    ...partial,
  };
}

describe("truncateForTrace", () => {
  it("关闭截断时原样返回，并记下序列化字节", () => {
    const result = truncateForTrace({ a: 1 }, limits({ truncateEnabled: false }));
    assert.deepEqual(result.value, { a: 1 });
    assert.equal(result.truncated, false);
    assert.equal(result.bytes, Buffer.byteLength(JSON.stringify({ a: 1 }), "utf8"));
  });

  it("脱敏键、正文按字符截、历史只留头尾", () => {
    const result = truncateForTrace(
      {
        apiKey: "secret",
        content: "hello world",
        messages: ["a", "b", "c", "d"],
      },
      limits(),
    );
    const value = result.value as {
      apiKey: string;
      content: string;
      messages: unknown[];
    };
    assert.equal(value.apiKey, "***");
    const blank = truncateForTrace({ token: "" }, limits({ redactKeys: ["token"] }));
    assert.equal((blank.value as { token: string }).token, "***");
    assert.equal(blank.truncated, false);
    assert.equal(value.content, "hello…");
    assert.equal(result.truncated, true);
    assert.equal(value.messages.length, 4);
    assert.deepEqual(value.messages[0], "a");
    assert.deepEqual(value.messages[2], { __omitted: 1, __note: "1 messages omitted" });
    assert.deepEqual(value.messages[3], "d");
  });

  it("二进制可省略或只留长度；整包超限时换成预览壳", () => {
    const meta = truncateForTrace(Buffer.from("abcd"), limits());
    assert.deepEqual(meta.value, { __binary: true, bytes: 4 });

    const omitted = truncateForTrace(Buffer.from("abcd"), limits({ captureBinary: "omit" }));
    assert.equal(omitted.value, undefined);

    const huge = truncateForTrace(
      "x".repeat(100),
      limits({ maxPayloadBytes: 20, maxFieldBytes: 32 }),
    );
    const shell = huge.value as { __truncatedPayload: boolean; preview: string };
    assert.equal(shell.__truncatedPayload, true);
    assert.ok(shell.preview.length < 100);
  });

  it("从通用设置取出截断字段", () => {
    const got = limitsFromGeneral({
      traceTruncateEnabled: false,
      traceMaxFieldBytes: 1,
      traceMaxPayloadBytes: 2,
      traceMaxMessageChars: 3,
      traceMaxHistoryMessages: 4,
      traceCaptureBinary: "omit",
      traceRedactKeys: ["token"],
    } as GeneralSettings);
    assert.equal(got.truncateEnabled, false);
    assert.deepEqual(got.redactKeys, ["token"]);
    assert.equal(got.captureBinary, "omit");
  });
});
