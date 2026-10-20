/**
 * 终端会话运行态与结果组装（desktop/src/terminal/sessionRun.ts）。
 * 仅覆盖纯逻辑：PTY / SQLite 相关行为受本机 ABI 限制不在此覆盖。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  completeResult,
  createRun,
  stillRunningResult,
  takeIncrementalOutput,
} from "../../src/terminal/sessionRun";
import type { SessionRecord } from "../../src/terminal/terminalSessionTypes";

function record(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    meta: {
      sessionId: "s1",
      title: "shell",
      cwd: "",
      cols: 80,
      rows: 24,
      status: "running",
      createdAt: 0,
    },
    proc: null,
    output: "",
    waiters: [],
    run: null,
    ...over,
  };
}

describe("createRun", () => {
  it("starts running with a pending settled promise", () => {
    const run = createRun("login");
    assert.equal(run.execMode, "login");
    assert.equal(run.status, "running");
    assert.equal(run.finalized, false);
    assert.equal(run.outputCursor, 0);
    assert.equal(run.spilled, false);
    assert.ok(run.settled instanceof Promise);
    run.resolveSettled();
  });
});

describe("takeIncrementalOutput", () => {
  it("returns the whole buffer for interactive sessions", () => {
    const rec = record({ output: "a\nb" });
    assert.equal(takeIncrementalOutput(rec), "a\nb");
  });

  it("advances the cursor and strips done markers", () => {
    const rec = record({ output: "one" });
    rec.run = createRun("direct");
    assert.equal(takeIncrementalOutput(rec), "one");
    // 游标推进后再取为增量
    rec.output += "two";
    assert.equal(takeIncrementalOutput(rec), "two");
  });
});

describe("completeResult", () => {
  it("reports complete with exit code and spill info", () => {
    const rec = record({ output: "done" });
    rec.run = createRun("direct");
    rec.run.exitCode = 3;
    rec.run.outputBytes = 42;
    rec.run.spilled = true;
    rec.run.outputReportPath = ".tw/shell/s1.log";
    const result = completeResult(rec, "exit");
    assert.equal(result.outcome, "complete");
    assert.equal(result.backgrounded, false);
    assert.equal(result.exitCode, 3);
    assert.equal(result.output, "done");
    assert.equal(result.outputPath, ".tw/shell/s1.log");
    assert.equal(result.outputBytes, 42);
    assert.equal(result.outputTruncated, true);
    assert.equal(result.execMode, "direct");
  });

  it("falls back to meta.exitCode when run has none", () => {
    const rec = record({ output: "" });
    rec.meta.exitCode = 7;
    const result = completeResult(rec, "timeout");
    assert.equal(result.exitCode, 7);
  });
});

describe("stillRunningResult", () => {
  it("reports still_running without exit code", () => {
    const rec = record({ output: "half" });
    rec.run = createRun("login");
    const result = stillRunningResult(rec, "timeout");
    assert.equal(result.outcome, "still_running");
    assert.equal(result.backgrounded, true);
    assert.equal(result.exitCode, null);
    assert.equal(result.output, "half");
  });
});
