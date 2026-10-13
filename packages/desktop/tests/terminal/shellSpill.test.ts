/**
 * 大输出落盘路径与内存尾部截断。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import {
  appendShellSpill,
  pruneShellSpillDir,
  removeShellSpill,
  resolveSpillLocation,
  shellOutputFilePath,
  trimMemoryTail,
} from "../../src/terminal/shellSpill";

describe("shellSpill", () => {
  it("trimMemoryTail 丢掉前缀并回报长度", () => {
    const { output, dropped } = trimMemoryTail("abcdefghij", 4);
    assert.equal(output, "ghij");
    assert.equal(dropped, 6);
    assert.deepEqual(trimMemoryTail("abc", 10), { output: "abc", dropped: 0 });
  });

  it("有 workspace 时 reportPath 为工作区相对路径", () => {
    const ws = path.join(os.tmpdir(), "tw-ws-spill");
    const loc = resolveSpillLocation({
      workspaceRoot: ws,
      dataDir: path.join(os.tmpdir(), "tw-data"),
      sessionId: "term_abc",
    });
    assert.equal(loc.reportPath, ".thinker/shell-output/term_abc.log");
    assert.equal(
      loc.absolutePath,
      path.join(ws, ".thinker", "shell-output", "term_abc.log"),
    );
  });

  it("append / prune 过期 spill", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-spill-"));
    const file = shellOutputFilePath(dir, "term_test1");
    assert.ok(appendShellSpill(file, "hello"));
    assert.equal(fs.readFileSync(file, "utf8"), "hello");
    // 拨回 mtime，避免 Windows 时间精度导致 now-mtime < 0
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(file, past, past);
    pruneShellSpillDir(path.dirname(file), { maxAgeMs: 1_000 });
    assert.equal(fs.existsSync(file), false);
    removeShellSpill(file);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
