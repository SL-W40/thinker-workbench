/**
 * Call Tree：短标签，不贴长 summary。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { callTreeLabel } from "../../src/features/trace/callTreeModel";

function span(partial: Partial<TraceSpanRecord>): TraceSpanRecord {
  return {
    spanId: "s1",
    sessionId: "sess",
    name: "x",
    kind: "other",
    source: "agent",
    startTs: 1,
    ...partial,
  };
}

describe("callTreeLabel", () => {
  it("tool 用短名，忽略长 summary", () => {
    const label = callTreeLabel(
      span({
        kind: "tool",
        name: "tool:read_file",
        summary: "read_file · " + "a".repeat(200),
      }),
    );
    assert.equal(label, "read_file");
  });

  it("Task 优先短 summary，不被错误的会话 title 覆盖", () => {
    const label = callTreeLabel(
      span({
        kind: "tool",
        name: "tool:Task",
        summary: "Task · Engine 包深度探索",
        attrs: { title: "帮我介绍一下这个项目" },
      }),
    );
    assert.equal(label, "Task · Engine 包深度探索");
  });

  it("subagent 优先短 summary", () => {
    const label = callTreeLabel(
      span({
        kind: "subagent",
        name: "subagent:explorer",
        summary: "explorer · Engine 包深度探索",
        attrs: { title: "帮我介绍一下这个项目" },
      }),
    );
    assert.equal(label, "explorer · Engine 包深度探索");
  });

  it("长 summary 回落时硬截断", () => {
    const long = "word ".repeat(30).trim();
    const label = callTreeLabel(
      span({
        kind: "other",
        name: "",
        summary: long,
      }),
    );
    assert.ok(label.length <= 48);
    assert.ok(label.endsWith("…"));
  });
});
