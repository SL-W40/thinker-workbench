/**
 * SequenceDiagram 布局模型纯函数（layout.ts）。
 */
import assert from "node:assert/strict";
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  buildMessages,
  clusterParallelTasks,
  estimateLabelW,
  hasExplicitForeground,
  inferFromLane,
  isBackgroundTask,
  laneOf,
  type Msg,
  overlaps,
  parKeyOf,
  scopeOf,
  type TaskMeta,
  tagForIndex,
  taskTitle,
} from "../../../src/features/trace/SequenceDiagram/layout";

function span(over: Partial<TraceSpanRecord>): TraceSpanRecord {
  return {
    id: "s1",
    sessionId: "sess",
    name: "graph.node",
    runType: "chain",
    source: "app",
    startTs: 0,
    ...over,
  };
}

function task(over: Partial<TaskMeta>): TaskMeta {
  return {
    id: "t1",
    title: "Task",
    startTs: 0,
    endTs: 10,
    msgs: [],
    background: false,
    tag: "A",
    ...over,
  };
}

function msgWith(span: TraceSpanRecord): Msg {
  return { seq: 1, span, from: "renderer", to: "graph", label: "x", scope: "main" };
}

describe("laneOf", () => {
  it("maps source first, then name prefixes, then runType", () => {
    assert.equal(laneOf(span({ source: "app" })), "renderer");
    assert.equal(laneOf(span({ source: "desktop" })), "desktop");
    assert.equal(laneOf(span({ source: "agent", name: "mcp.fs.read" })), "tool");
    assert.equal(laneOf(span({ source: "agent", name: "model.chat" })), "model");
    assert.equal(laneOf(span({ source: "agent", name: "subagent:x" })), "subagent");
    assert.equal(laneOf(span({ source: "agent", name: "checkpoint.save" })), "runtime");
    assert.equal(laneOf(span({ source: "agent", name: "weird", runType: "llm" })), "model");
    assert.equal(laneOf(span({ source: "agent", name: "weird", runType: "tool" })), "tool");
    assert.equal(laneOf(span({ source: "agent", name: "weird", runType: "chain" })), "graph");
    assert.equal(laneOf(span({ source: "agent", name: "weird", runType: "memory" })), "runtime");
  });
});

describe("inferFromLane", () => {
  it("keeps neighbour lane for known hops", () => {
    const prev = span({ id: "p", source: "app" });
    assert.equal(inferFromLane(span({ source: "desktop" }), prev, "desktop"), "renderer");
    assert.equal(inferFromLane(span({ source: "agent" }), prev, "runtime"), "renderer");
  });

  it("falls back to fixed ladder without prev", () => {
    assert.equal(inferFromLane(span({ source: "desktop" }), undefined, "desktop"), "renderer");
    assert.equal(inferFromLane(span({ source: "agent" }), undefined, "runtime"), "desktop");
    assert.equal(inferFromLane(span({ source: "agent" }), undefined, "graph"), "runtime");
    assert.equal(inferFromLane(span({ source: "agent" }), undefined, "model"), "model");
  });

  it("keeps prev lane when same run / trace", () => {
    const prev = span({ id: "p", agentRunId: "r1", traceId: "tr1" });
    const cur = span({ id: "c", agentRunId: "r1", traceId: "tr1" });
    assert.equal(inferFromLane(cur, prev, "model"), "renderer");
  });
});

describe("scopeOf", () => {
  it("prefers taskId, then tool callId cross-reference, else main", () => {
    assert.equal(scopeOf(span({ taskId: " task-1 " }), []), "task-1");
    const tool = span({ name: "Task", runType: "tool", attrs: { callId: "c1" } });
    const owner = span({ id: "o", taskId: "c1" });
    assert.equal(scopeOf(tool, [owner]), "c1");
    assert.equal(scopeOf(tool, []), "main");
    assert.equal(scopeOf(span({}), []), "main");
  });
});

describe("buildMessages", () => {
  it("sorts by startTs, links parent lane, numbers seq", () => {
    const parent = span({
      id: "p",
      source: "agent",
      name: "model.chat",
      runType: "llm",
      startTs: 0,
      endTs: 5,
    });
    const child = span({
      id: "c",
      source: "agent",
      name: "tool:read",
      runType: "tool",
      parentId: "p",
      startTs: 1,
    });
    const msgs = buildMessages([child, parent]);
    assert.deepEqual(
      msgs.map((m) => m.span.id),
      ["p", "c"],
    );
    assert.equal(msgs[0].seq, 1);
    assert.equal(msgs[1].seq, 2);
    assert.equal(msgs[1].from, "model");
    assert.equal(msgs[1].to, "tool");
  });
});

describe("clusterParallelTasks", () => {
  it("groups overlapping tasks, keeps non-overlapping apart", () => {
    const a = task({ id: "a", startTs: 0, endTs: 10 });
    const b = task({ id: "b", startTs: 5, endTs: 15 });
    const c = task({ id: "c", startTs: 100, endTs: 110 });
    const clusters = clusterParallelTasks([c, b, a]);
    assert.equal(clusters.length, 2);
    assert.deepEqual(
      clusters[0].map((t) => t.id),
      ["a", "b"],
    );
    assert.deepEqual(
      clusters[1].map((t) => t.id),
      ["c"],
    );
  });

  it("strict mode pairs only two background tasks", () => {
    const bg1 = task({ id: "bg1", startTs: 0, endTs: 10, background: true });
    const bg2 = task({ id: "bg2", startTs: 5, endTs: 15, background: true });
    const fg = task({ id: "fg", startTs: 5, endTs: 15, background: false });
    const clusters = clusterParallelTasks([fg, bg2, bg1]);
    assert.equal(clusters.length, 2);
    const pair = clusters.find((c) => c.length === 2);
    assert.deepEqual(
      pair?.map((t) => t.id),
      ["bg1", "bg2"],
    );
  });
});

describe("task flags and helpers", () => {
  it("isBackgroundTask / hasExplicitForeground read attrs", () => {
    assert.equal(isBackgroundTask([msgWith(span({ attrs: { background: true } }))]), true);
    assert.equal(isBackgroundTask([msgWith(span({ attrs: { backgrounded: true } }))]), true);
    assert.equal(isBackgroundTask([msgWith(span({}))]), false);
    assert.equal(
      hasExplicitForeground(task({ msgs: [msgWith(span({ attrs: { background: false } }))] })),
      true,
    );
    assert.equal(hasExplicitForeground(task({ msgs: [msgWith(span({}))] })), false);
  });

  it("taskTitle prefers subagent span, then tool span, then id slice", () => {
    const sub = span({ id: "x", taskId: "t1", name: "subagent:researcher" });
    assert.equal(taskTitle("t1", [sub]), taskTitle("t1", [sub]));
    assert.ok(taskTitle("t1", [sub]).length > 0);
    assert.equal(taskTitle("abcdefghijklmn", []), "abcdefghij");
  });

  it("parKeyOf is order-independent; tagForIndex wraps A-Z", () => {
    assert.equal(parKeyOf([task({ id: "b" }), task({ id: "a" })]), "a|b");
    assert.equal(tagForIndex(0), "A");
    assert.equal(tagForIndex(25), "Z");
    assert.equal(tagForIndex(26), "A");
  });

  it("overlaps is half-open; estimateLabelW is clamped", () => {
    assert.equal(overlaps(0, 10, 5, 15), true);
    assert.equal(overlaps(0, 10, 10, 20), false);
    assert.equal(estimateLabelW(""), 8);
    assert.equal(estimateLabelW("x".repeat(100)), 160);
  });
});
