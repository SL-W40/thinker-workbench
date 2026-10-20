/**
 * FileCheckpointer：原子写 / 读回，以及对损坏（非对象）内容返回 null 的兜底。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";
import { FileCheckpointer } from "../../src/checkpoint/file";
import type { Checkpoint } from "../../src/checkpoint/types";

describe("FileCheckpointer", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-cp-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("保存后可按 threadId 读回", async () => {
    const cp = new FileCheckpointer(dir);
    const checkpoint = { threadId: "t1", channelValues: {} } as unknown as Checkpoint;
    await cp.save(checkpoint);
    const loaded = await cp.load("t1");
    assert.ok(loaded);
    assert.equal(loaded?.threadId, "t1");
  });

  it("文件不存在返回 null", async () => {
    const cp = new FileCheckpointer(dir);
    assert.equal(await cp.load("missing"), null);
  });

  it("标量 / 数组 / threadId 不匹配的损坏内容均返回 null", async () => {
    const cp = new FileCheckpointer(dir);
    fs.writeFileSync(path.join(dir, "scalar.json"), "123");
    assert.equal(await cp.load("scalar"), null);
    fs.writeFileSync(path.join(dir, "arr.json"), "[1,2]");
    assert.equal(await cp.load("arr"), null);
    fs.writeFileSync(path.join(dir, "wrong.json"), JSON.stringify({ threadId: "other" }));
    assert.equal(await cp.load("wrong"), null);
  });
});
