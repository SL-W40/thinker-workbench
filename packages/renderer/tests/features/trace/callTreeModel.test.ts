/**
 * 追踪树：按 parentSpanId 建行。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { buildCallTreeRows } from "../../../src/features/trace/callTreeModel";

function span(
  partial: Partial<TraceSpanRecord> & Pick<TraceSpanRecord, "spanId" | "name" | "kind">,
): TraceSpanRecord {
  return {
    sessionId: "s",
    startTs: 0,
    ...partial,
  };
}

describe("buildCallTreeRows", () => {
  it("DFS 中并发 Task 为兄弟，并标 parKey", () => {
    const spans: TraceSpanRecord[] = [
      span({
        spanId: "gt",
        name: "graph.tools",
        kind: "graph",
        startTs: 10,
        endTs: 50,
      }),
      span({
        spanId: "ta",
        name: "tool:Task",
        kind: "tool",
        taskId: "a",
        parentSpanId: "gt",
        startTs: 11,
        endTs: 40,
        summary: "Task · A",
        attrs: { title: "A" },
      }),
      span({
        spanId: "tb",
        name: "tool:Task",
        kind: "tool",
        taskId: "b",
        parentSpanId: "gt",
        startTs: 12,
        endTs: 45,
        summary: "Task · B",
        attrs: { title: "B" },
      }),
    ];
    const { rows } = buildCallTreeRows(spans, new Set());
    const ids = rows.map((r) => r.span.spanId);
    const iGt = ids.indexOf("gt");
    const iA = ids.indexOf("ta");
    const iB = ids.indexOf("tb");
    assert.ok(iGt >= 0 && iA > iGt && iB > iA);
    assert.equal(rows[iA]!.depth, rows[iB]!.depth);
    assert.equal(rows[iGt]!.depth, 0);
    assert.equal(rows[iGt]!.parKey, undefined);
    assert.equal(rows[iA]!.parKey, "a|b");
    assert.equal(rows[iB]!.parKey, "a|b");
    assert.equal(rows[iA]!.parSize, 2);
    // 同一 par 内本地分色；与全局 task 顺序无关
    assert.equal(rows[iA]!.taskColorIdx, 0);
    assert.equal(rows[iB]!.taskColorIdx, 1);
  });

  it("子行无 taskId 时继承祖先 Task 的分色", () => {
    const spans: TraceSpanRecord[] = [
      span({
        spanId: "ta",
        name: "tool:Task",
        kind: "tool",
        taskId: "a",
        startTs: 10,
        endTs: 40,
      }),
      span({
        spanId: "sa",
        name: "subagent:explorer",
        kind: "subagent",
        parentSpanId: "ta",
        startTs: 11,
        endTs: 39,
      }),
      span({
        spanId: "tb",
        name: "tool:Task",
        kind: "tool",
        taskId: "b",
        startTs: 12,
        endTs: 45,
      }),
      span({
        spanId: "sb",
        name: "subagent:explorer",
        kind: "subagent",
        parentSpanId: "tb",
        startTs: 13,
        endTs: 44,
      }),
    ];
    const { rows } = buildCallTreeRows(spans, new Set());
    const byId = Object.fromEntries(rows.map((r) => [r.span.spanId, r]));
    assert.equal(byId.sa!.taskColorIdx, 0);
    assert.equal(byId.sb!.taskColorIdx, 1);
    assert.equal(byId.sa!.span.taskId, "a");
    assert.equal(byId.sb!.span.taskId, "b");
  });

  it("other 节点（runtime/context）可建行", () => {
    const spans: TraceSpanRecord[] = [
      span({
        spanId: "run",
        name: "runtime.run",
        kind: "other",
        startTs: 1,
        endTs: 100,
      }),
      span({
        spanId: "ctx",
        name: "context.assemble",
        kind: "other",
        parentSpanId: "run",
        startTs: 2,
        endTs: 10,
      }),
      span({
        spanId: "ga",
        name: "graph.agent",
        kind: "graph",
        parentSpanId: "run",
        startTs: 11,
        endTs: 90,
      }),
    ];
    const { rows } = buildCallTreeRows(spans, new Set());
    assert.equal(rows.length, 3);
    assert.equal(rows[0]!.span.spanId, "run");
    assert.equal(rows[1]!.span.spanId, "ctx");
    assert.equal(rows[1]!.depth, 1);
    assert.equal(rows[2]!.depth, 1);
  });

  it("多个 par 各自从 0 起分色，互不占用", () => {
    const spans: TraceSpanRecord[] = [
      span({
        spanId: "t1a",
        name: "tool:Task",
        kind: "tool",
        taskId: "p1a",
        startTs: 10,
        endTs: 30,
      }),
      span({
        spanId: "t1b",
        name: "tool:Task",
        kind: "tool",
        taskId: "p1b",
        startTs: 15,
        endTs: 35,
      }),
      // 第二组并行，时间上不与第一组重叠
      span({
        spanId: "t2a",
        name: "tool:Task",
        kind: "tool",
        taskId: "p2a",
        startTs: 100,
        endTs: 130,
      }),
      span({
        spanId: "t2b",
        name: "tool:Task",
        kind: "tool",
        taskId: "p2b",
        startTs: 110,
        endTs: 140,
      }),
    ];
    const { rows } = buildCallTreeRows(spans, new Set());
    const byId = Object.fromEntries(rows.map((r) => [r.span.spanId, r]));
    assert.equal(byId.t1a!.taskColorIdx, 0);
    assert.equal(byId.t1b!.taskColorIdx, 1);
    assert.equal(byId.t2a!.taskColorIdx, 0);
    assert.equal(byId.t2b!.taskColorIdx, 1);
    assert.notEqual(byId.t1a!.parKey, byId.t2a!.parKey);
  });
});
