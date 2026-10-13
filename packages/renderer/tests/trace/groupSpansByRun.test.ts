/**
 * Trace：按 runId 分组。
 */
import assert from "node:assert/strict";
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { groupSpansByRun, UNKNOWN_RUN_ID } from "../../src/features/trace/callTreeModel";

function span(
  partial: Partial<TraceSpanRecord> & Pick<TraceSpanRecord, "spanId" | "startTs">,
): TraceSpanRecord {
  return {
    sessionId: "sess",
    name: "run",
    kind: "other",
    source: "agent",
    ...partial,
  };
}

describe("groupSpansByRun", () => {
  it("按 runId 分组并按 startTs 升序", () => {
    const groups = groupSpansByRun([
      span({ spanId: "a", startTs: 200, runId: "run_b" }),
      span({ spanId: "b", startTs: 100, runId: "run_a" }),
      span({ spanId: "c", startTs: 150, runId: "run_a" }),
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.runId, "run_a");
    assert.equal(groups[0]?.startTs, 100);
    assert.equal(groups[0]?.spans.length, 2);
    assert.equal(groups[1]?.runId, "run_b");
  });

  it("缺 runId 归入 UNKNOWN_RUN_ID", () => {
    const groups = groupSpansByRun([
      span({ spanId: "x", startTs: 1 }),
      span({ spanId: "y", startTs: 2, runId: "  " }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.runId, UNKNOWN_RUN_ID);
    assert.equal(groups[0]?.spans.length, 2);
  });
});
