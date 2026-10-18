/**
 * 消息级计时：终态只写引擎下发的值，hydrate 不做任何推断。
 */
import assert from "node:assert/strict";
import type { ChatMessage } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  finishMessageClock,
  localElapsedMs,
  settleLoadedMessages,
} from "../../../src/features/chat/messageClock";

function assistant(patch: Partial<ChatMessage> = {}): ChatMessage {
  return { id: "a1", role: "assistant", text: "hi", ...patch };
}

describe("finishMessageClock", () => {
  it("终态写引擎给的耗时，并清掉 live 计时字段", () => {
    const next = finishMessageClock(assistant({ runStartedAt: 1_000 }), 7_300);
    assert.equal(next.durationMs, 7_300);
    assert.equal(next.runStartedAt, undefined);
  });

  it("引擎未给耗时时保持未知（不补 0、不算墙钟）", () => {
    const next = finishMessageClock(assistant({ runStartedAt: Date.now() - 9_000 }));
    assert.equal(next.durationMs, undefined);
    assert.equal(next.runStartedAt, undefined);
  });

  it("已有耗时且引擎未给时不覆盖", () => {
    const next = finishMessageClock(assistant({ durationMs: 500, runStartedAt: 1 }));
    assert.equal(next.durationMs, 500);
  });
});

describe("localElapsedMs", () => {
  it("有 runStartedAt 才给值（实测，不是推断）", () => {
    const ms = localElapsedMs(assistant({ runStartedAt: Date.now() - 2_000 }));
    assert.equal((ms ?? -1) >= 2_000, true);
    assert.equal(localElapsedMs(assistant({})), undefined);
  });
});

describe("settleLoadedMessages", () => {
  it("hydrate 不从时间线反推耗时：无 durationMs 就保持未知", () => {
    const [next] = settleLoadedMessages(
      [
        assistant({
          pending: true,
          runStartedAt: Date.now() - 30_000,
          timeline: [
            { id: "s1", kind: "status", status: "thinking", active: true, durationMs: 1_000 },
            { id: "k1", kind: "tool", name: "read_file", phase: "end", active: false },
          ],
        }),
      ],
      "idle",
    );
    assert.equal(next.pending, false);
    assert.equal(next.durationMs, undefined, "绝不用 status 步之和冒充耗时");
    assert.equal(next.runStartedAt, undefined);
  });

  it("引擎已写下的耗时原样保留", () => {
    const [next] = settleLoadedMessages([assistant({ durationMs: 73_100 })], "idle");
    assert.equal(next.durationMs, 73_100);
  });

  it("running / queued 不动（live 段仍由事件流推进）", () => {
    const input = [assistant({ pending: true, runStartedAt: 1_234 })];
    assert.equal(settleLoadedMessages(input, "running"), input);
    assert.equal(settleLoadedMessages(input, "queued"), input);
  });

  it("crashed 补软中断行，仍不臆造耗时", () => {
    const [next] = settleLoadedMessages([assistant({ pending: true })], "crashed");
    assert.equal(next.durationMs, undefined);
    assert.equal(
      next.timeline?.some((s) => s.kind === "error" && s.code === "PROCESS_EXIT"),
      true,
    );
  });
});
