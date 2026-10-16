/**
 * Trace：按 agentRunId 分组。
 */
import assert from "node:assert/strict";
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { groupSpansByRun, UNKNOWN_RUN_ID } from "../../src/features/trace/callTreeModel";

function span(
  partial: Partial<TraceSpanRecord> & Pick<TraceSpanRecord, "id" | "startTs">,
): TraceSpanRecord {
  return {
    sessionId: "sess",
    name: "run",
    runType: "chain",
    source: "agent",
    ...partial,
  };
}

describe("groupSpansByRun", () => {
  it("按 agentRunId 分组并按 startTs 升序", () => {
    const groups = groupSpansByRun([
      span({ id: "a", startTs: 200, agentRunId: "run_b" }),
      span({ id: "b", startTs: 100, agentRunId: "run_a" }),
      span({ id: "c", startTs: 150, agentRunId: "run_a" }),
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.runId, "run_a");
    assert.equal(groups[0]?.startTs, 100);
    assert.equal(groups[0]?.spans.length, 2);
    assert.equal(groups[1]?.runId, "run_b");
  });

  it("缺 agentRunId 归入 UNKNOWN_RUN_ID", () => {
    const groups = groupSpansByRun([
      span({ id: "x", startTs: 1 }),
      span({ id: "y", startTs: 2, agentRunId: "  " }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.runId, UNKNOWN_RUN_ID);
    assert.equal(groups[0]?.spans.length, 2);
  });
});
