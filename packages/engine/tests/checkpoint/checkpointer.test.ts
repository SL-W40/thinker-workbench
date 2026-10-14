/**
 * 检查点：内存表与按线程 JSON 文件（原子替换、坏文件）。
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import { FileCheckpointer } from "../../src/checkpoint/file";
import { MemoryCheckpointer } from "../../src/checkpoint/memory";
import type { Checkpoint } from "../../src/checkpoint/types";

function checkpoint(threadId: string, nodeId: string): Checkpoint {
  return { threadId, nodeId, state: { step: 1 }, updatedAt: 10 };
}

describe("MemoryCheckpointer", () => {
  it("按 threadId 保存、覆盖、清除；没有则 null", async () => {
    const store = new MemoryCheckpointer();
    assert.equal(await store.load("t"), null);
    await store.save(checkpoint("t", "agent"));
    await store.save(checkpoint("t", "tools"));
    assert.equal((await store.load("t"))?.nodeId, "tools");
    await store.clear("t");
    assert.equal(await store.load("t"), null);
    await store.clear("missing");
  });
});

describe("FileCheckpointer", () => {
  it("写入后能读回；清掉不存在的线程不抛错", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tw-ckpt-"));
    const store = new FileCheckpointer(dir);
    await store.save(checkpoint("thread-1", "agent"));
    const loaded = await store.load("thread-1");
    assert.equal(loaded?.nodeId, "agent");
    assert.equal(loaded?.threadId, "thread-1");
    await store.clear("thread-1");
    assert.equal(await store.load("thread-1"), null);
    await store.clear("thread-1");
  });

  it("文件里的 threadId 对不上就当没有；非法 JSON 继续抛出", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tw-ckpt-"));
    const store = new FileCheckpointer(dir);
    const file = path.join(dir, "thr.json");
    await fs.writeFile(file, JSON.stringify(checkpoint("other", "agent")), "utf8");
    assert.equal(await store.load("thr"), null);

    await fs.writeFile(file, "{", "utf8");
    await assert.rejects(store.load("thr"), SyntaxError);
  });
});
