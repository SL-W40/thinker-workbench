/**
 * Trace 载荷截断与脱敏。循环引用会让 walk 无限递归，这里不覆盖那条路径。
 */
import assert from "node:assert/strict";
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

  it("脱敏键、字段按字节截、数组只留前缀", () => {
    const result = truncateForTrace(
      {
        apiKey: "secret",
        content: "hello world",
        messages: ["a", "b", "c", "d"],
      },
      limits({ maxFieldBytes: 5 }),
    );
    const value = result.value as {
      apiKey: string;
      content: string;
      messages: unknown[];
    };
    assert.equal(value.apiKey, "[redacted]");
    const blank = truncateForTrace({ token: "" }, limits({ redactKeys: ["token"] }));
    assert.equal((blank.value as { token: string }).token, "[redacted]");
    assert.equal(blank.truncated, true);
    assert.equal(value.content, "hello…");
    assert.equal(result.truncated, true);
    assert.equal(value.messages.length, 3);
    assert.deepEqual(value.messages, ["a", "b", "c"]);
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
    const shell = huge.value as { __truncated: boolean; preview: string };
    assert.equal(shell.__truncated, true);
    assert.ok(shell.preview.length < 100);
  });

  it("limitsFromGeneral 使用内置默认截断策略", () => {
    const got = limitsFromGeneral();
    assert.equal(got.truncateEnabled, true);
    assert.ok(got.redactKeys.includes("apiKey"));
    assert.equal(got.captureBinary, "meta");
    assert.ok(got.maxFieldBytes > 0);
  });
});
