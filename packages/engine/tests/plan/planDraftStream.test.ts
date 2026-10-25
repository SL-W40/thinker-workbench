/**
 * create_plan 参数流式：只认 create_plan、按 index 归并、按时间节流、
 * 还要保证「还没有可读内容时不发事件」（避免先出现一张空卡）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { ChatToolCallDelta } from "../../src/model/types";
import { createPlanDraftStream } from "../../src/plan/planDraftStream";
import type { RunEmitEvent } from "../../src/runtime/runEmit";

type FeedOpts = {
  /** 节流间隔；缺省 0（每片都发）。 */
  intervalMs?: number;
  /** 每个片段对应的时间戳；缺省恒为 0。 */
  nowSeq?: number[];
};

function feed(chunks: ChatToolCallDelta[], opts: FeedOpts = {}) {
  const events: RunEmitEvent[] = [];
  let step = 0;
  const stream = createPlanDraftStream({
    emit: (event) => {
      events.push(event);
    },
    sessionId: "s1",
    intervalMs: opts.intervalMs ?? 0,
    now: () => opts.nowSeq?.[step] ?? 0,
  });
  chunks.forEach((chunk, i) => {
    step = i;
    stream.onToolCallDelta(chunk);
  });
  return events;
}

function planEvents(events: RunEmitEvent[]) {
  return events.filter((e) => e.type === "plan") as Extract<RunEmitEvent, { type: "plan" }>[];
}

describe("createPlanDraftStream", () => {
  it("create_plan 的参数片段聚合成草稿事件", () => {
    const events = planEvents(
      feed([
        { index: 0, id: "call_1", name: "create_plan", argsChunk: '{"title":"飞机' },
        { index: 0, id: "call_1", name: "create_plan", argsChunk: '大战","todos":[{"la' },
        { index: 0, id: "call_1", name: "create_plan", argsChunk: 'bel":"骨架"}]}' },
      ]),
    );
    assert.equal(events.length, 3);
    const last = events[events.length - 1];
    assert.equal(last?.phase, "drafting");
    assert.equal(last?.callId, "call_1");
    assert.equal(last?.title, "飞机大战");
    assert.equal(last?.todos.length, 1);
    assert.equal(last?.planId, "plan-s1");
  });

  it("其它工具不产生草稿", () => {
    const events = feed([
      { index: 0, name: "write_file", argsChunk: '{"path":"a' },
      { index: 0, name: "write_file", argsChunk: '.ts"}' },
    ]);
    assert.equal(events.length, 0);
  });

  it("还没有标题 / 描述 / 待办时不发事件", () => {
    const events = feed([{ index: 0, name: "create_plan", argsChunk: '{"' }]);
    assert.equal(events.length, 0);
  });

  it("按 index 归并，互不串台", () => {
    const events = planEvents(
      feed([
        { index: 0, name: "create_plan", argsChunk: '{"title":"计划甲"' },
        { index: 1, name: "create_plan", argsChunk: '{"title":"计划乙"' },
      ]),
    );
    assert.equal(events.length, 2);
    assert.equal(events[0]?.title, "计划甲");
    assert.equal(events[1]?.title, "计划乙");
  });

  it("节流窗口内的片段被合并丢弃", () => {
    const events = feed(
      [
        { index: 0, name: "create_plan", argsChunk: '{"title":"甲' },
        { index: 0, name: "create_plan", argsChunk: '乙丙"' },
        { index: 0, name: "create_plan", argsChunk: ',"todos":[]}' },
      ],
      { intervalMs: 60, nowSeq: [0, 5, 200] },
    );
    // 5ms 时距上次不足 60ms → 丢弃；200ms 时才发第二次
    assert.equal(events.length, 2);
    assert.equal(events[0]?.title, "甲");
    assert.equal(events[1]?.title, "甲乙丙");
  });
});
