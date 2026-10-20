/**
 * runErrors：取消 / 网络 / 可重试 HTTP 的单一可信源（desktop / renderer / engine 共用）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  isCancelErrorMessage,
  isRetryableHttpStatus,
  isTransientNetworkError,
  NETWORK_ERROR_PATTERN,
  OPENAI_AUTH_HTTP_PATTERN,
  OPENAI_TRANSIENT_HTTP_PATTERN,
  RETRYABLE_HTTP_STATUSES,
} from "../src/runErrors";

describe("isCancelErrorMessage", () => {
  it("命中取消 / 中止 / 停止文案，其余为否", () => {
    assert.equal(isCancelErrorMessage("Run cancelled."), true);
    assert.equal(isCancelErrorMessage("This operation was aborted"), true);
    assert.equal(isCancelErrorMessage("Stopped."), true);
    assert.equal(isCancelErrorMessage("已停止。"), true);
    assert.equal(isCancelErrorMessage("network timeout"), false);
    assert.equal(isCancelErrorMessage("   "), false);
  });
});

describe("isTransientNetworkError", () => {
  it("命中网络 / 瞬时错误各关键字", () => {
    for (const msg of [
      "terminated",
      "fetch failed",
      "connect ECONNRESET",
      "ETIMEDOUT",
      "getaddrinfo ENOTFOUND",
      "EAI_AGAIN",
      "connect ECONNREFUSED",
      "socket hang up",
      "other side closed",
      "network error",
      "UND_ERR_SOCKET",
    ]) {
      assert.equal(isTransientNetworkError(msg), true, msg);
    }
  });

  it("鉴权 / 取消 / 普通校验错误不算网络错误", () => {
    assert.equal(isTransientNetworkError("validation failed"), false);
    assert.equal(isTransientNetworkError("MODEL_API_KEY_MISSING"), false);
    assert.equal(isTransientNetworkError("Run cancelled."), false);
  });
});

describe("isRetryableHttpStatus", () => {
  it("只重试 429 与 502/503/504", () => {
    for (const status of [429, 502, 503, 504]) {
      assert.equal(isRetryableHttpStatus(status), true, String(status));
    }
    for (const status of [400, 401, 403, 404, 500, 501]) {
      assert.equal(isRetryableHttpStatus(status), false, String(status));
    }
  });

  it("RETRYABLE_HTTP_STATUSES 与判定一致", () => {
    assert.deepEqual([...RETRYABLE_HTTP_STATUSES], [429, 502, 503, 504]);
  });
});

describe("OpenAI HTTP 文案模式", () => {
  it("TRANSIENT 命中可重试状态，AUTH 命中 401/403", () => {
    assert.equal(OPENAI_TRANSIENT_HTTP_PATTERN.test("OpenAI HTTP 429"), true);
    assert.equal(OPENAI_TRANSIENT_HTTP_PATTERN.test("OpenAI HTTP 503"), true);
    assert.equal(OPENAI_TRANSIENT_HTTP_PATTERN.test("OpenAI HTTP 401"), false);
    assert.equal(OPENAI_AUTH_HTTP_PATTERN.test("OpenAI HTTP 401"), true);
    assert.equal(OPENAI_AUTH_HTTP_PATTERN.test("OpenAI HTTP 429"), false);
  });

  it("NETWORK_ERROR_PATTERN 与 isTransientNetworkError 同源", () => {
    assert.equal(NETWORK_ERROR_PATTERN.test("fetch failed"), true);
    assert.equal(NETWORK_ERROR_PATTERN.test("nope"), false);
  });
});
