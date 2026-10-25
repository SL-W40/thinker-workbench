/**
 * engine → main 浏览器请求：正常往返与「没人回」的兜底超时。
 * 卡死过一次（面板没开就快照，主进程那边 capturePage 不返回），
 * 这里保证至少能还给模型一个错误。
 */
import assert from "node:assert/strict";
import type { UtilityBrowserEvent, UtilityBrowserRequest } from "@thinker-workbench/shared";
import { beforeEach, describe, it, vi } from "vitest";

const posted: UtilityBrowserRequest[] = [];

vi.mock("../../src/host/port", () => ({
  postToParent: (msg: UtilityBrowserRequest) => posted.push(msg),
}));
vi.mock("../../src/workspace", () => ({ getAllowAiBrowser: () => true }));
vi.mock("../../src/runtime/runEmit", () => ({
  getRunIds: () => ({ runId: "run_1", threadId: "thread_1" }),
}));

const { BROWSER_CALL_TIMEOUT_MS, browserCall, handleBrowserEvent } = await import(
  "../../src/host/browserClient"
);

function lastRequestId(): string {
  const req = posted[posted.length - 1];
  assert.ok(req, "should have posted a browser request");
  return req.requestId;
}

describe("browserCall", () => {
  beforeEach(() => {
    posted.length = 0;
    vi.useRealTimers();
  });

  it("主进程回 result 时正常返回并清掉超时", async () => {
    vi.useFakeTimers();
    const call = browserCall("snapshot", { takeScreenshotAfterwards: false });
    handleBrowserEvent({
      requestId: lastRequestId(),
      phase: "result",
      output: "interactive: 0",
    } as UtilityBrowserEvent);
    const result = await call;
    assert.equal(result.output, "interactive: 0");
    // 定时器已清：推进超过上限也不会有未处理的 rejection
    await vi.advanceTimersByTimeAsync(BROWSER_CALL_TIMEOUT_MS * 2);
  });

  it("主进程回 error 时抛出该错误", async () => {
    const call = browserCall("snapshot", {});
    // 先挂上断言，避免 rejection 早于断言注册
    const assertion = assert.rejects(call, /No page is loaded/);
    handleBrowserEvent({
      requestId: lastRequestId(),
      phase: "error",
      error: "No page is loaded in the built-in browser.",
    } as UtilityBrowserEvent);
    await assertion;
  });

  it("没人回时按超时失败，提示先开面板 / 导航", async () => {
    vi.useFakeTimers();
    const call = browserCall("snapshot", {});
    const assertion = assert.rejects(call, /did not respond/);
    await vi.advanceTimersByTimeAsync(BROWSER_CALL_TIMEOUT_MS);
    await assertion;
  });

  it("取消信号直接失败，不等超时", async () => {
    const controller = new AbortController();
    const call = browserCall("snapshot", {}, controller.signal);
    const assertion = assert.rejects(call, /cancelled/i);
    controller.abort();
    await assertion;
  });
});
