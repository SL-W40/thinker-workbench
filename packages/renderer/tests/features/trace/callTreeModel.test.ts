/**
 * 追踪树：按 parentId 建行。
 */
import assert from "node:assert/strict";
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { buildCallTreeRows } from "../../../src/features/trace/callTreeModel";

function span(
  partial: Partial<TraceSpanRecord> & Pick<TraceSpanRecord, "id" | "name" | "runType">,
): TraceSpanRecord {
  return {
    sessionId: "s",
    startTs: 0,
    source: "agent",
    ...partial,
  };
}

describe("buildCallTreeRows", () => {
  it("DFS 中并发 Task 为兄弟，并标 parKey", () => {
    const spans: TraceSpanRecord[] = [
      span({
        id: "gt",
        name: "graph.tools",
        runType: "chain",
        startTs: 10,
        endTs: 50,
      }),
      span({
        id: "ta",
        name: "tool:Task",
        runType: "tool",
        taskId: "a",
        parentId: "gt",
        startTs: 11,
        endTs: 40,
        summary: "Task · A",
        attrs: { title: "A" },
      }),
      span({
        id: "tb",
        name: "tool:Task",
        runType: "tool",
        taskId: "b",
        parentId: "gt",
        startTs: 12,
        endTs: 45,
        summary: "Task · B",
        attrs: { title: "B" },
      }),
    ];
    const { rows } = buildCallTreeRows(spans, new Set());
    const ids = rows.map((r) => r.span.id);
    const iGt = ids.indexOf("gt");
    const iA = ids.indexOf("ta");
    const iB = ids.indexOf("tb");
    assert.ok(iGt >= 0 && iA > iGt && iB > iA);
    assert.equal(rows[iA]?.depth, rows[iB]?.depth);
    assert.equal(rows[iGt]?.depth, 0);
    assert.equal(rows[iGt]?.parKey, undefined);
    assert.equal(rows[iA]?.parKey, "a|b");
    assert.equal(rows[iB]?.parKey, "a|b");
    assert.equal(rows[iA]?.parSize, 2);
    // 同一 par 内本地分色；与全局 task 顺序无关
    assert.equal(rows[iA]?.taskColorIdx, 0);
    assert.equal(rows[iB]?.taskColorIdx, 1);
  });

  it("子行无 taskId 时继承祖先 Task 的分色", () => {
    const spans: TraceSpanRecord[] = [
      span({
        id: "ta",
        name: "tool:Task",
        runType: "tool",
        taskId: "a",
        startTs: 10,
        endTs: 40,
      }),
      span({
        id: "sa",
        name: "subagent:explorer",
        runType: "chain",
        parentId: "ta",
        startTs: 11,
        endTs: 39,
      }),
      span({
        id: "tb",
        name: "tool:Task",
        runType: "tool",
        taskId: "b",
        startTs: 12,
        endTs: 45,
      }),
      span({
        id: "sb",
        name: "subagent:explorer",
        runType: "chain",
        parentId: "tb",
        startTs: 13,
        endTs: 44,
      }),
    ];
    const { rows } = buildCallTreeRows(spans, new Set());
    const byId = Object.fromEntries(rows.map((r) => [r.span.id, r]));
    assert.equal(byId.sa?.taskColorIdx, 0);
    assert.equal(byId.sb?.taskColorIdx, 1);
    assert.equal(byId.sa?.span.taskId, "a");
    assert.equal(byId.sb?.span.taskId, "b");
  });

  it("other 节点（runtime/context）可建行", () => {
    const spans: TraceSpanRecord[] = [
      span({
        id: "run",
        name: "runtime.run",
        runType: "chain",
        startTs: 1,
        endTs: 100,
      }),
      span({
        id: "ctx",
        name: "context.assemble",
        runType: "chain",
        parentId: "run",
        startTs: 2,
        endTs: 10,
      }),
      span({
        id: "ga",
        name: "graph.agent",
        runType: "chain",
        parentId: "run",
        startTs: 11,
        endTs: 90,
      }),
    ];
    const { rows } = buildCallTreeRows(spans, new Set());
    assert.equal(rows.length, 3);
    assert.equal(rows[0]?.span.id, "run");
    assert.equal(rows[1]?.span.id, "ctx");
    assert.equal(rows[1]?.depth, 1);
    assert.equal(rows[2]?.depth, 1);
  });

  it("多个 par 各自从 0 起分色，互不占用", () => {
    const spans: TraceSpanRecord[] = [
      span({
        id: "t1a",
        name: "tool:Task",
        runType: "tool",
        taskId: "p1a",
        startTs: 10,
        endTs: 30,
      }),
      span({
        id: "t1b",
        name: "tool:Task",
        runType: "tool",
        taskId: "p1b",
        startTs: 15,
        endTs: 35,
      }),
      // 第二组并行，时间上不与第一组重叠
      span({
        id: "t2a",
        name: "tool:Task",
        runType: "tool",
        taskId: "p2a",
        startTs: 100,
        endTs: 130,
      }),
      span({
        id: "t2b",
        name: "tool:Task",
        runType: "tool",
        taskId: "p2b",
        startTs: 110,
        endTs: 140,
      }),
    ];
    const { rows } = buildCallTreeRows(spans, new Set());
    const byId = Object.fromEntries(rows.map((r) => [r.span.id, r]));
    assert.equal(byId.t1a?.taskColorIdx, 0);
    assert.equal(byId.t1b?.taskColorIdx, 1);
    assert.equal(byId.t2a?.taskColorIdx, 0);
    assert.equal(byId.t2b?.taskColorIdx, 1);
    assert.notEqual(byId.t1a?.parKey, byId.t2a?.parKey);
  });
});
