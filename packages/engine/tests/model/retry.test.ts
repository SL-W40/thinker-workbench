/**
 * 模型重试判定：取消、HTTP 状态、错误文案、退避等待。
 */
import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";
import {
  formatErrorMessage,
  isCancelError,
  isCancelErrorMessage,
  isRetryableError,
  isRetryableHttpStatus,
  sleep,
  sleepBackoff,
} from "../../src/model/retry";

describe("isCancelErrorMessage", () => {
  it("matches cancel and aborted wording", () => {
    assert.equal(isCancelErrorMessage("Run cancelled."), true);
    assert.equal(isCancelErrorMessage("This operation was aborted"), true);
    assert.equal(isCancelErrorMessage("Stopped."), true);
    assert.equal(isCancelErrorMessage("network timeout"), false);
  });
});

describe("isCancelError", () => {
  it("detects AbortError by name", () => {
    const err = new Error("This operation was aborted");
    err.name = "AbortError";
    assert.equal(isCancelError(err), true);
  });

  it("非 AbortError 时只看文案", () => {
    assert.equal(isCancelError(new Error("socket hang up")), false);
    assert.equal(isCancelError("Run cancelled."), true);
  });
});

describe("formatErrorMessage", () => {
  it("沿 cause 链拼接，重复文案只留一次，最多四层", () => {
    const root = new Error("root");
    const mid = new Error("mid", { cause: root });
    const top = new Error("mid", { cause: mid });
    assert.equal(formatErrorMessage(top), "mid: root");
    assert.equal(formatErrorMessage("plain"), "plain");
  });

  it("空 Error 文案回退 Unknown error", () => {
    assert.equal(formatErrorMessage(new Error("  ")), "Unknown error");
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
});

describe("isRetryableError", () => {
  it("已吐过 token、取消、缺 key、业务 4xx 不重试", () => {
    const net = new Error("fetch failed");
    assert.equal(isRetryableError(net, { emittedTokens: true }), false);
    assert.equal(isRetryableError(new Error("Run cancelled.")), false);
    assert.equal(isRetryableError(new Error("MODEL_API_KEY_MISSING")), false);
    assert.equal(isRetryableError(new Error("OpenAI HTTP 401")), false);
    assert.equal(isRetryableError(new Error("OpenAI HTTP 400 bad")), false);
  });

  it("TypeError 与网络文案可重试", () => {
    assert.equal(isRetryableError(new TypeError("terminated")), true);
    assert.equal(isRetryableError(new Error("connect ECONNRESET")), true);
    assert.equal(isRetryableError(new Error("validation failed")), false);
  });
});

describe("sleepBackoff", () => {
  it("等待后兑现；已取消或等待中取消则拒绝", async () => {
    vi.useFakeTimers();
    try {
      const pending = sleepBackoff(1, new AbortController().signal);
      await vi.advanceTimersByTimeAsync(1_000);
      await pending;

      const already = new AbortController();
      already.abort();
      await assert.rejects(sleepBackoff(1, already.signal), /cancelled/);

      const live = new AbortController();
      const waiting = sleepBackoff(2, live.signal);
      live.abort();
      await assert.rejects(waiting, /cancelled/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("sleep", () => {
  it("到时兑现；负时长立即兑现；已取消或等待中取消则拒绝", async () => {
    vi.useFakeTimers();
    try {
      const done = sleep(-10, new AbortController().signal);
      await vi.advanceTimersByTimeAsync(0);
      await done;

      const already = new AbortController();
      already.abort();
      await assert.rejects(sleep(100, already.signal), /Run cancelled\./);

      const live = new AbortController();
      const waiting = sleep(500, live.signal);
      live.abort();
      await assert.rejects(waiting, /Run cancelled\./);

      const custom = new AbortController();
      const waitingCustom = sleep(500, custom.signal, "my reason");
      custom.abort();
      await assert.rejects(waitingCustom, /my reason/);
    } finally {
      vi.useRealTimers();
    }
  });
});
