/**
 * 落库防抖调度与 epoch 陈旧判定：防抖合并、切会话丢弃、取消语义、代际作废。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  createDebouncedSave,
  createEpochGate,
  SAVE_DEBOUNCE_MS,
  type SaveTimers,
} from "../../../src/features/chat/session/chatPersistence";

/** 手动计时器：确定性推进，不依赖假计时器对 window / globalThis 的差异。 */
function manualTimers() {
  let now = 0;
  let seq = 0;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  const timers: SaveTimers = {
    setTimeout: (fn, ms) => {
      seq += 1;
      tasks.set(seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout: (id) => {
      tasks.delete(id);
    },
  };
  return {
    timers,
    advance: (ms: number) => {
      now += ms;
      for (const [id, task] of [...tasks]) {
        if (task.at <= now) {
          tasks.delete(id);
          task.fn();
        }
      }
    },
    pending: () => tasks.size,
  };
}

describe("createDebouncedSave", () => {
  it("默认防抖毫秒为 400（两处通道共用）", () => {
    assert.equal(SAVE_DEBOUNCE_MS, 400);
  });

  it("防抖合并：静默期内多次 schedule 只落地最后一次", () => {
    const clock = manualTimers();
    const save = createDebouncedSave(SAVE_DEBOUNCE_MS, clock.timers);
    const landed: string[] = [];
    save.schedule("s1", { run: () => landed.push("第一次") });
    clock.advance(100);
    save.schedule("s1", { run: () => landed.push("第二次") });
    clock.advance(100);
    save.schedule("s1", { run: () => landed.push("第三次") });
    assert.equal(clock.pending(), 1);

    clock.advance(399);
    assert.deepEqual(landed, []);
    clock.advance(1);
    assert.deepEqual(landed, ["第三次"]);
    assert.equal(save.has("s1"), false);
  });

  it("不同 key 互不打扰，各自落地", () => {
    const clock = manualTimers();
    const save = createDebouncedSave(SAVE_DEBOUNCE_MS, clock.timers);
    const landed: string[] = [];
    save.schedule("s1", { run: () => landed.push("s1") });
    save.schedule("s2", { run: () => landed.push("s2") });
    clock.advance(SAVE_DEBOUNCE_MS);
    assert.deepEqual(landed, ["s1", "s2"]);
  });

  it("切会话丢弃过期落库：valid 复核失败则不执行", () => {
    const clock = manualTimers();
    const save = createDebouncedSave(SAVE_DEBOUNCE_MS, clock.timers);
    let current = "s1";
    const landed: string[] = [];
    save.schedule("s1", {
      valid: () => current === "s1",
      run: () => landed.push("s1"),
    });
    // 防抖未到期就切走会话
    current = "s2";
    clock.advance(SAVE_DEBOUNCE_MS);
    assert.deepEqual(landed, []);
    assert.equal(save.has("s1"), false);
  });

  it("cancel 取消且不执行", () => {
    const clock = manualTimers();
    const save = createDebouncedSave(SAVE_DEBOUNCE_MS, clock.timers);
    let ran = false;
    save.schedule("s1", {
      run: () => {
        ran = true;
      },
    });
    assert.equal(save.has("s1"), true);
    save.cancel("s1");
    assert.equal(save.has("s1"), false);
    clock.advance(SAVE_DEBOUNCE_MS * 2);
    assert.equal(ran, false);
  });

  it("重复 schedule 顶掉前一次的 valid / run", () => {
    const clock = manualTimers();
    const save = createDebouncedSave(SAVE_DEBOUNCE_MS, clock.timers);
    let allow = false;
    const landed: string[] = [];
    save.schedule("s1", { valid: () => allow, run: () => landed.push("第一次") });
    allow = true;
    save.schedule("s1", { run: () => landed.push("第二次") });
    clock.advance(SAVE_DEBOUNCE_MS);
    assert.deepEqual(landed, ["第二次"]);
  });
});

describe("createEpochGate", () => {
  it("未 bump 时捕获始终有效", () => {
    const gate = createEpochGate();
    const captured = gate.capture();
    assert.equal(gate.isStale(captured), false);
    assert.equal(gate.capture(), captured);
  });

  it("bump 后此前所有捕获作废，新捕获有效", () => {
    const gate = createEpochGate();
    const first = gate.capture();
    gate.bump();
    assert.equal(gate.isStale(first), true);
    const second = gate.capture();
    assert.equal(gate.isStale(second), false);
    gate.bump();
    assert.equal(gate.isStale(first), true);
    assert.equal(gate.isStale(second), true);
  });

  it("两个门闩相互独立（会话代与轮次代不互相作废）", () => {
    const sessionGate = createEpochGate();
    const runGate = createEpochGate();
    const run = runGate.capture();
    sessionGate.bump();
    assert.equal(runGate.isStale(run), false);
    runGate.bump();
    assert.equal(runGate.isStale(run), true);
    assert.equal(sessionGate.isStale(sessionGate.capture()), false);
  });
});
