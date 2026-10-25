/**
 * 写工具的路径建议锁。
 *
 * 语义：同路径串行排队并等待（不是报错）；不同路径完全并行；只读工具不参与排队。
 * 这里锁住的是「行为契约」，不依赖真实文件系统。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import {
  activePathLockCount,
  normalizeLockKey,
  PATH_LOCK_TIMEOUT_MS,
  resetPathLocks,
  withPathLock,
} from "../../../src/tools/shared/pathLock";

const ROOT = "e:/ws";

/** 记录执行顺序的共享探针。 */
function probe() {
  const order: string[] = [];
  let running = 0;
  let maxConcurrent = 0;
  return {
    order,
    stats: () => ({ running, maxConcurrent }),
    async trace(label: string, delayMs = 10) {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      order.push(`enter:${label}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      order.push(`exit:${label}`);
      running -= 1;
    },
  };
}

afterEach(() => {
  resetPathLocks();
});

describe("normalizeLockKey", () => {
  it("相对路径按工作区根解析成绝对路径", () => {
    const key = normalizeLockKey(ROOT, "src/a.ts");
    assert.ok(key.replace(/\\/g, "/").endsWith("ws/src/a.ts"));
  });

  it("同一路径的不同分隔符写法得到同一个锁键", () => {
    assert.equal(
      normalizeLockKey(ROOT, "src\\a.ts").replace(/\\/g, "/"),
      normalizeLockKey(ROOT, "src/a.ts").replace(/\\/g, "/"),
    );
  });

  it("已经是绝对路径时不再拼接工作区根", () => {
    const abs = normalizeLockKey(ROOT, "D:/other/a.ts");
    assert.ok(abs.replace(/\\/g, "/").includes("other/a.ts"));
  });
});

describe("withPathLock 串行语义", () => {
  it("同路径写操作严格串行：进入与退出不交错", async () => {
    const p = probe();
    const a = withPathLock(ROOT, "a.ts", () => p.trace("a", 20));
    const b = withPathLock(ROOT, "a.ts", () => p.trace("b", 1));
    await Promise.all([a, b]);
    assert.deepEqual(p.order, ["enter:a", "exit:a", "enter:b", "exit:b"]);
    assert.equal(p.stats().maxConcurrent, 1);
  });

  it("不同路径完全并行", async () => {
    const p = probe();
    const a = withPathLock(ROOT, "a.ts", () => p.trace("a", 20));
    const b = withPathLock(ROOT, "b.ts", () => p.trace("b", 20));
    await Promise.all([a, b]);
    assert.equal(p.stats().maxConcurrent, 2);
  });

  it("返回值与异常都原样透出", async () => {
    assert.equal(await withPathLock(ROOT, "x.ts", () => Promise.resolve(42)), 42);
    await assert.rejects(
      withPathLock(ROOT, "x.ts", () => Promise.reject(new Error("boom"))),
      /boom/,
    );
  });

  it("前一个写操作抛异常后，队列不卡死（后续写仍可执行）", async () => {
    await assert.rejects(
      withPathLock(ROOT, "y.ts", () => Promise.reject(new Error("first failed"))),
      /first failed/,
    );
    assert.equal(await withPathLock(ROOT, "y.ts", () => Promise.resolve("ok")), "ok");
  });

  it("等待超过超时则明确报错，而不是无限挂起", async () => {
    // 第一个持有锁 200ms，第二个只给 20ms 等待窗口
    const slow = withPathLock(ROOT, "slow.ts", () => new Promise((r) => setTimeout(r, 200)));
    await assert.rejects(
      withPathLock(ROOT, "slow.ts", () => Promise.resolve("never"), { timeoutMs: 20 }),
      /Another session is still writing/,
    );
    await slow;
  });

  it("超时时长默认值为 5s", () => {
    assert.equal(PATH_LOCK_TIMEOUT_MS, 5000);
  });
});

describe("锁表清理", () => {
  it("执行完毕后不再留下表示闲忙的条目", async () => {
    assert.equal(activePathLockCount(), 0);
    const running = withPathLock(ROOT, "clean.ts", () => new Promise((r) => setTimeout(r, 20)));
    await new Promise((r) => setTimeout(r, 1));
    assert.equal(activePathLockCount(), 1);
    await running;
    // 队列尾部清理发生在微任务里，等一拍
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(activePathLockCount(), 0);
  });

  it("resetPathLocks 可强制清空（run 取消后的兜底）", async () => {
    const running = withPathLock(ROOT, "drop.ts", () => new Promise((r) => setTimeout(r, 50)));
    void running.catch(() => undefined);
    resetPathLocks();
    assert.equal(activePathLockCount(), 0);
  });
});
