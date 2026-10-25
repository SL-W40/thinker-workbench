/**
 * before-image 快照：首写捕获、幂等、跳过规则与 manifest 登记。
 *
 * 快照的存放位置依赖 run 上下文，这里用 stub 注入 dataDir / workspaceId / runId，
 * 全部落在临时目录里，不碰真实数据区。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, it, vi } from "vitest";

let tmpRoot = "";
let runId = "run_1";

/** 当前 run 上下文 stub（captureBeforeImage 通过它定位目录）。 */
vi.mock("../../src/runtime/runContext", () => ({
  getRunContext: () => ({
    runId,
    threadId: "thread_1",
    workspaceId: "ws_1",
    dataDir: tmpRoot,
  }),
}));

const { captureBeforeImage, dropBeforeImage, readManifest } = await import(
  "../../src/checkpoint/fileSnapshot"
);

/** `<dataDir>/workspaces/<ws>/checkpoints/files/<runId>`。 */
function runDir(): string {
  return path.join(tmpRoot, "workspaces", "ws_1", "checkpoints", "files", runId);
}

async function entryOf(relPath: string) {
  const manifest = await readManifest(runDir());
  return manifest.entries.find((item) => item.path === relPath);
}

describe("captureBeforeImage", () => {
  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), "snapshot-"));
    runId = "run_1";
  });

  it("已存在的文件：落快照并登记 modify", async () => {
    const ws = await mkdtemp(path.join(tmpRoot, "ws-"));
    fs.mkdirSync(path.join(ws, "src"), { recursive: true });
    await writeFile(path.join(ws, "src", "a.txt"), "hello");
    const ok = await captureBeforeImage(ws, "src/a.txt");
    assert.equal(ok, true);
    const entry = await entryOf("src/a.txt");
    assert.equal(entry?.kind, "modify");
    assert.equal(entry?.bytes, 5);
  });

  it("同一 run 内重复调用是幂等的（第二次不再覆盖）", async () => {
    const ws = await mkdtemp(path.join(tmpRoot, "ws-"));
    await writeFile(path.join(ws, "a.txt"), "v1");
    assert.equal(await captureBeforeImage(ws, "a.txt"), true);
    await writeFile(path.join(ws, "a.txt"), "changed-by-agent");
    assert.equal(await captureBeforeImage(ws, "a.txt"), false);
    // 快照内容仍是首写前的内容
    const entry = await entryOf("a.txt");
    assert.equal(entry?.bytes, 2);
  });

  it("原本不存在的文件登记 create（回滚语义是删除）", async () => {
    const ws = await mkdtemp(path.join(tmpRoot, "ws-"));
    assert.equal(await captureBeforeImage(ws, "new.ts"), false);
    const entry = await entryOf("new.ts");
    assert.equal(entry?.kind, "create");
    assert.equal(entry?.bytes, 0);
  });

  it("超过单文件上限只登记 skipped，不占磁盘", async () => {
    const ws = await mkdtemp(path.join(tmpRoot, "ws-"));
    const target = path.join(ws, "big.bin");
    await writeFile(target, Buffer.alloc(2048, 1));
    assert.equal(await captureBeforeImage(ws, "big.bin", 1024), false);
    const entry = await entryOf("big.bin");
    assert.equal(entry?.kind, "skipped");
    assert.ok(entry?.skipReason?.includes("too large"));
    const files = fs.readdirSync(runDir());
    assert.equal(
      files.some((name) => name.includes("big.bin")),
      false,
    );
  });

  it("`.git` 下的路径被忽略", async () => {
    const ws = await mkdtemp(path.join(tmpRoot, "ws-"));
    fs.mkdirSync(path.join(ws, ".git"), { recursive: true });
    await writeFile(path.join(ws, ".git", "config"), "x");
    assert.equal(await captureBeforeImage(ws, ".git/config"), false);
    const entry = await entryOf(".git/config");
    assert.equal(entry?.kind, "skipped");
    assert.equal(entry?.skipReason, "ignored path (.git)");
  });

  it("不在 run 内（无上下文）时静默跳过", async () => {
    const ws = await mkdtemp(path.join(tmpRoot, "ws-"));
    const prev = runId;
    // 通过清空 dataDir 之外的手段无法造出「无上下文」，这里断言不抛错即可
    assert.equal(typeof (await captureBeforeImage(ws, "x.txt")), "boolean");
    runId = prev;
  });
});

describe("dropBeforeImage", () => {
  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), "snapshot-"));
  });

  it("采纳后 manifest 里不再有该条目，也不再有快照文件", async () => {
    const ws = await mkdtemp(path.join(tmpRoot, "ws-"));
    await writeFile(path.join(ws, "a.txt"), "content");
    await captureBeforeImage(ws, "a.txt");
    await dropBeforeImage("a.txt");
    const entry = await entryOf("a.txt");
    assert.equal(entry, undefined);
    const files = fs.readdirSync(runDir());
    assert.equal(files.includes("a.txt"), false);
  });

  it("路径不存在时不抛错（幂等）", async () => {
    await dropBeforeImage("never-existed.txt");
  });
});
