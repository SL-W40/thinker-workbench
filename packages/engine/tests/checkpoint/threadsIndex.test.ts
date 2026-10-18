/**
 * 线程键登记表单测：runKey 派生、登记 / 查找 / 单 run 清理 / 整线程清理。
 * 全部走临时目录，不触碰真实 checkpointDir。
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "vitest";
import {
  clearRunKey,
  clearThreadKeys,
  lookupRunKey,
  registerRunKey,
  runKeyFor,
} from "../../src/checkpoint/threadsIndex";

const dirs: string[] = [];

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "thinker-threads-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runKeyFor", () => {
  it("派生 run 级线程键，同会话不同 run 键不同", () => {
    assert.equal(runKeyFor("th1", "run1"), "th1::run:run1");
    assert.notEqual(runKeyFor("th1", "run1"), runKeyFor("th1", "run2"));
  });
});

describe("threads index", () => {
  it("登记后可查；新 run 覆盖旧 run；clearRunKey 只清当前键", () => {
    const dir = makeDir();
    registerRunKey(dir, "th1", "th1::run:run1");
    assert.equal(lookupRunKey(dir, "th1"), "th1::run:run1");

    registerRunKey(dir, "th1", "th1::run:run2");
    assert.equal(lookupRunKey(dir, "th1"), "th1::run:run2");

    // 旧 run 结算不应误删已被新 run 覆盖的登记
    clearRunKey(dir, "th1", "th1::run:run1");
    assert.equal(lookupRunKey(dir, "th1"), "th1::run:run2");

    clearRunKey(dir, "th1", "th1::run:run2");
    assert.equal(lookupRunKey(dir, "th1"), null);
  });

  it("clearThreadKeys 返回被清键并移除登记", () => {
    const dir = makeDir();
    registerRunKey(dir, "thA", "thA::run:r1");
    assert.deepEqual(clearThreadKeys(dir, "thA"), ["thA::run:r1"]);
    assert.equal(lookupRunKey(dir, "thA"), null);
    assert.deepEqual(clearThreadKeys(dir, "thA"), []);
  });

  it("空目录 / 损坏文件安全返回空", () => {
    const dir = makeDir();
    assert.equal(lookupRunKey(dir, "thX"), null);
    writeFileSync(join(dir, "threads.json"), "not-json", "utf8");
    assert.equal(lookupRunKey(dir, "thX"), null);
  });

  it("登记文件为原子写盘格式（无 .tmp 残留）", () => {
    const dir = makeDir();
    registerRunKey(dir, "thB", "thB::run:r1");
    const raw = JSON.parse(readFileSync(join(dir, "threads.json"), "utf8")) as Record<
      string,
      string
    >;
    assert.equal(raw.thB, "thB::run:r1");
    assert.equal(
      (() => {
        try {
          readFileSync(join(dir, "threads.json.tmp"), "utf8");
          return true;
        } catch {
          return false;
        }
      })(),
      false,
    );
  });

  it("空参数直接跳过，不写文件", () => {
    const dir = makeDir();
    registerRunKey(dir, "", "k");
    registerRunKey("", "th", "k");
    assert.throws(() => readFileSync(join(dir, "threads.json"), "utf8"));
  });
});
