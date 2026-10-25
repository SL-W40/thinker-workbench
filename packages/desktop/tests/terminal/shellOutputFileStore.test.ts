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
} from "../../src/terminal/shellOutputFileStore";

describe("shellSpill", () => {
  it("trimMemoryTail 丢掉前缀并回报长度", () => {
    const { output, dropped } = trimMemoryTail("abcdefghij", 4);
    assert.equal(output, "ghij");
    assert.equal(dropped, 6);
    assert.deepEqual(trimMemoryTail("abc", 10), { output: "abc", dropped: 0 });
  });

  it("落点在工作区数据目录且 reportPath 为绝对路径", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-data-"));
    const loc = resolveSpillLocation({ workspaceId: "ws_a", sessionId: "term_abc", dataDir });
    assert.equal(path.basename(loc.reportPath), "term_abc.log");
    // 不再写进用户工作区：落点必须是 dataDir 下的工作区数据目录，且 reportPath 与写入路径一致
    assert.equal(loc.reportPath, loc.absolutePath);
    assert.ok(
      loc.absolutePath.replace(/\\/g, "/").includes("/workspaces/ws_a/shell-output/"),
      loc.absolutePath,
    );
  });

  it("无归属时落到默认工作区目录", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-data-"));
    const loc = resolveSpillLocation({ sessionId: "term_abc", dataDir });
    assert.ok(
      loc.absolutePath.replace(/\\/g, "/").includes("/workspaces/ws_default/shell-output/"),
    );
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("append / prune 过期 spill", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-data-"));
    const file = shellOutputFilePath("ws_spill_test", "term_test1", dataDir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    assert.ok(appendShellSpill(file, "hello"));
    assert.equal(fs.readFileSync(file, "utf8"), "hello");
    // 拨回 mtime，避免 Windows 时间精度导致 now-mtime < 0
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(file, past, past);
    pruneShellSpillDir(path.dirname(file), { maxAgeMs: 1_000 });
    assert.equal(fs.existsSync(file), false);
    removeShellSpill(file);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
