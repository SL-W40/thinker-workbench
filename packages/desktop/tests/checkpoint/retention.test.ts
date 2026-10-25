/**
 * Checkpoint 保留策略：读写归一、裁剪语义与硬例外保护。
 *
 * 通过 mock `config/paths` 把工作区 Checkpoint 目录指到临时目录，
 * 避免污染真实数据区，也不需要 SQLite。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, it, vi } from "vitest";

let root = "";

vi.mock("../../src/config/paths", () => ({
  getWorkspaceCheckpointDir: (workspaceId: string) => path.join(root, workspaceId),
  getWorkspaceChatDbPath: (workspaceId: string) => path.join(root, workspaceId, "chat.db"),
  getWorkspaceTraceDir: (workspaceId: string) => path.join(root, workspaceId, "trace"),
  getDataDir: () => root,
}));

const { getRetention, getStats, pruneNow, setRetention } = await import(
  "../../src/checkpoint/retention"
);

/** 造一个 run 目录（含 before-image 文件），可选控制 mtime。 */
async function makeRun(workspaceId: string, runId: string, bytes: number, ageMs = 0) {
  const dir = path.join(root, workspaceId, "files", runId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "src__a.txt"), Buffer.alloc(bytes, 1));
  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify({ runId, threadId: "t", at: Date.now(), entries: [] }, null, 2),
    "utf8",
  );
  if (ageMs > 0) {
    const past = Date.now() - ageMs;
    fs.utimesSync(dir, new Date(past), new Date(past));
  }
  return dir;
}

describe("retention 读写", () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "retention-"));
  });

  it("未配置时返回默认阈值", async () => {
    const policy = await getRetention("ws_1");
    assert.equal(policy.maxRuns, 30);
    assert.equal(policy.maxAgeDays, 14);
    assert.equal(policy.maxTotalBytes, 256 * 1024 * 1024);
    assert.equal(policy.maxFileBytes, 5 * 1024 * 1024);
  });

  it("写入补丁后持久化并被归一", async () => {
    await setRetention("ws_1", { maxRuns: 5, maxRunsExtra: undefined });
    const policy = await getRetention("ws_1");
    assert.equal(policy.maxRuns, 5);
    // 未给的字段仍走默认
    assert.equal(policy.maxAgeDays, 14);
  });

  it("越界值被钳制后再落盘", async () => {
    const policy = await setRetention("ws_1", { maxRuns: 9999 });
    assert.equal(policy.maxRuns, 200);
  });
});

describe("getStats", () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "retention-"));
  });

  it("无快照时统计为零", async () => {
    const stats = await getStats("ws_1");
    assert.deepEqual(stats, { runCount: 0, totalBytes: 0, oldestAt: null });
  });

  it("统计 run 数、字节与最早时间", async () => {
    await makeRun("ws_1", "old", 100, 10 * 24 * 3600 * 1000);
    await makeRun("ws_1", "new", 200, 0);
    const stats = await getStats("ws_1");
    assert.equal(stats.runCount, 2);
    assert.ok(stats.totalBytes >= 300);
    assert.ok(stats.oldestAt !== null);
  });
});

describe("pruneNow", () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "retention-"));
  });

  it("目录不存在时返回空结果且 ok", async () => {
    const res = await pruneNow("ws_none");
    assert.equal(res.ok, true);
    assert.equal(res.removedRuns, 0);
  });

  it("超过 run 数上限时先删最旧的，保留最新的", async () => {
    await makeRun("ws_1", "r1", 10, 5_000);
    await makeRun("ws_1", "r2", 10, 1_000);
    await setRetention("ws_1", { maxRuns: 1 });
    const res = await pruneNow("ws_1");
    assert.equal(res.removedRuns, 1);
    assert.equal(fs.existsSync(path.join(root, "ws_1", "files", "r1")), false);
    assert.equal(fs.existsSync(path.join(root, "ws_1", "files", "r2")), true);
  });

  it("超过保留天数被裁剪", async () => {
    await makeRun("ws_1", "old", 10, 20 * 24 * 3600 * 1000);
    await makeRun("ws_1", "recent", 10, 1000);
    await setRetention("ws_1", { maxAgeDays: 14 });
    const res = await pruneNow("ws_1");
    assert.equal(res.removedRuns, 1);
    assert.equal(fs.existsSync(path.join(root, "ws_1", "files", "old")), false);
  });

  it("总字节超限时从最旧开始删", async () => {
    await makeRun("ws_1", "r1", 1000, 5_000);
    await makeRun("ws_1", "r2", 1000, 1_000);
    await setRetention("ws_1", { maxTotalBytes: 1200, maxRuns: 999, maxAgeDays: 0 });
    const res = await pruneNow("ws_1");
    assert.equal(res.removedRuns, 1);
    assert.equal(fs.existsSync(path.join(root, "ws_1", "files", "r1")), false);
  });

  it("running / pending 标记保护的 run 永不裁剪", async () => {
    const protectedDir = await makeRun("ws_1", "live", 10, 30 * 24 * 3600 * 1000);
    await writeFile(path.join(protectedDir, ".running"), "1");
    await makeRun("ws_1", "old", 10, 30 * 24 * 3600 * 1000);
    await setRetention("ws_1", { maxRuns: 1, maxAgeDays: 1 });
    const res = await pruneNow("ws_1");
    assert.equal(res.removedRuns, 1);
    assert.equal(res.keptRuns, 1);
    assert.equal(fs.existsSync(protectedDir), true);
  });

  it("全部受保护时不删任何东西", async () => {
    const dir = await makeRun("ws_1", "live", 10, 30 * 24 * 3600 * 1000);
    await writeFile(path.join(dir, ".pending"), "1");
    await setRetention("ws_1", { maxRuns: 0.5 as unknown as number, maxAgeDays: 1 });
    const res = await pruneNow("ws_1");
    assert.equal(res.removedRuns, 0);
    assert.equal(res.keptRuns, 1);
  });
});
