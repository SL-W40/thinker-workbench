/**
 * SequenceDiagram 段切分与展开纯函数（segments.ts）。
 */
import assert from "node:assert/strict";
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  buildMessages,
  type Msg,
  type TaskMeta,
} from "../../../src/features/trace/SequenceDiagram/layout";
import {
  buildSegments,
  expandSegments,
} from "../../../src/features/trace/SequenceDiagram/segments";

const LABELS = { main: "MAIN", task: "TASK", par: "PAR" };

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

function msg(over: Partial<Msg>): Msg {
  return {
    seq: 1,
    span: span({}),
    from: "renderer",
    to: "graph",
    label: "x",
    scope: "main",
    ...over,
  };
}

function task(over: Partial<TaskMeta>): TaskMeta {
  return {
    id: "t1",
    title: "Task one",
    startTs: 0,
    endTs: 10,
    msgs: [],
    background: false,
    tag: "A",
    ...over,
  };
}

describe("buildSegments", () => {
  it("splits main / task segments and interleaves by start", () => {
    const spans = [
      span({ id: "m1", startTs: 0, endTs: 1 }),
      span({ id: "k1", name: "tool:Task", runType: "tool", startTs: 2, endTs: 20, taskId: "t1" }),
      span({ id: "m2", startTs: 30, endTs: 31 }),
    ];
    const msgs = buildMessages(spans);
    const segments = buildSegments(msgs, spans, new Set());
    assert.deepEqual(
      segments.map((s) => s.type),
      ["main", "task", "main"],
    );
    const taskSeg = segments[1];
    assert.ok(taskSeg.type === "task");
    assert.equal(taskSeg.task.id, "t1");
    assert.equal(taskSeg.collapsed, false);
  });

  it("marks collapsed tasks from the collapsed set", () => {
    const spans = [
      span({ id: "k1", name: "tool:Task", runType: "tool", startTs: 0, endTs: 5, taskId: "t1" }),
    ];
    const msgs = buildMessages(spans);
    const segments = buildSegments(msgs, spans, new Set(["t1"]));
    assert.equal(segments.length, 1);
    assert.ok(segments[0].type === "task");
    assert.equal(segments[0].collapsed, true);
  });

  it("emits a par segment when two tasks overlap", () => {
    const spans = [
      span({ id: "a1", name: "tool:Task", runType: "tool", startTs: 0, endTs: 10, taskId: "ta" }),
      span({ id: "b1", name: "tool:Task", runType: "tool", startTs: 5, endTs: 15, taskId: "tb" }),
    ];
    const msgs = buildMessages(spans);
    const segments = buildSegments(msgs, spans, new Set());
    assert.equal(segments.length, 1);
    assert.ok(segments[0].type === "par");
    assert.equal(segments[0].tasks.length, 2);
    // par 内色标按簇内顺序重排 A/B
    assert.deepEqual(
      segments[0].tasks.map((t) => t.tag),
      ["A", "B"],
    );
  });
});

describe("expandSegments", () => {
  it("expand mode emits banner + rows per par task block", () => {
    const t1 = task({ id: "ta", title: "Alpha", msgs: [msg({ span: span({ id: "a1" }) })] });
    const t2 = task({ id: "tb", title: "Beta", msgs: [msg({ span: span({ id: "b1" }) })] });
    const rows = expandSegments(
      [{ type: "par", tasks: [t1, t2], collapsed: new Set() }],
      LABELS,
      {},
      "expand",
    );
    const banners = rows.filter((r) => r.kind === "banner");
    // par 总横幅 + 每个 Task 分块横幅
    assert.equal(banners.length, 3);
    const msgs = rows.filter((r) => r.kind === "msg");
    assert.equal(msgs.length, 2);
    // 可见顺序重编号
    assert.deepEqual(
      msgs.map((r) => (r.kind === "msg" ? r.msg.seq : 0)),
      [1, 2],
    );
  });

  it("swipe mode shows only the active task and respects slide index", () => {
    const t1 = task({ id: "ta", title: "Alpha", msgs: [msg({ span: span({ id: "a1" }) })] });
    const t2 = task({ id: "tb", title: "Beta", msgs: [msg({ span: span({ id: "b1" }) })] });
    const par = { type: "par" as const, tasks: [t1, t2], collapsed: new Set<string>() };
    const first = expandSegments([par], LABELS, {}, "swipe");
    assert.equal(first.filter((r) => r.kind === "msg").length, 1);
    const second = expandSegments([par], LABELS, { "ta|tb": 1 }, "swipe");
    assert.equal(second.filter((r) => r.kind === "msg").length, 1);
  });

  it("collapsed par emits banner only", () => {
    const t1 = task({ id: "ta" });
    const t2 = task({ id: "tb" });
    const rows = expandSegments(
      [{ type: "par", tasks: [t1, t2], collapsed: new Set(["ta", "tb"]) }],
      LABELS,
      {},
      "expand",
    );
    assert.equal(rows.length, 1);
    assert.ok(rows[0].kind === "banner");
  });

  it("collapsed task hides its messages", () => {
    const t1 = task({ id: "ta", msgs: [msg({ span: span({ id: "a1" }) })] });
    const rows = expandSegments(
      [{ type: "task", task: t1, collapsed: true }],
      LABELS,
      {},
      "expand",
    );
    assert.equal(rows.length, 1);
    assert.ok(rows[0].kind === "banner");
  });
});
