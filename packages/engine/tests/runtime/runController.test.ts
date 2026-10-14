/**
 * 单次 run 的取消控制器。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { RunController } from "../../src/runtime/RunController";

describe("RunController", () => {
  it("cancel 后 signal 与 aborted 同时为真", () => {
    const ctl = new RunController("run", "thread");
    assert.equal(ctl.aborted, false);
    let aborted = false;
    ctl.signal.addEventListener("abort", () => {
      aborted = true;
    });
    ctl.cancel();
    assert.equal(ctl.aborted, true);
    assert.equal(aborted, true);
    ctl.cancel();
    assert.equal(ctl.signal.aborted, true);
  });
});
