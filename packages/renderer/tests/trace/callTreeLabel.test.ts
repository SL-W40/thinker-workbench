/**
 * Call Tree：短标签，不贴长 summary。
 */
import assert from "node:assert/strict";
import type { TraceSpanRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { callTreeLabel } from "../../src/features/trace/callTreeModel";

function span(partial: Partial<TraceSpanRecord>): TraceSpanRecord {
  return {
    id: "s1",
    sessionId: "sess",
    name: "x",
    runType: "chain",
    source: "agent",
    startTs: 1,
    ...partial,
  };
}

describe("callTreeLabel", () => {
  it("tool 用短名，忽略长 summary", () => {
    const label = callTreeLabel(
      span({
        runType: "tool",
        name: "tool:read_file",
        summary: `read_file · ${"a".repeat(200)}`,
      }),
    );
    assert.equal(label, "read_file");
  });

  it("Task 优先短 summary，不被错误的会话 title 覆盖", () => {
    const label = callTreeLabel(
      span({
        runType: "tool",
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
        runType: "chain",
        name: "subagent:explorer",
        summary: "explorer · Engine 包深度探索",
        attrs: { title: "帮我介绍一下这个项目" },
      }),
    );
    assert.equal(label, "explorer · Engine 包深度探索");
  });

  it("LLM 只显示 model.chat，不带 mdl_ 后缀", () => {
    const label = callTreeLabel(
      span({
        runType: "llm",
        name: "model.chat",
        summary: "mdl_mv62fabc · chat",
      }),
    );
    assert.equal(label, "model.chat");
  });

  it("长 summary 回落时硬截断", () => {
    const long = "word ".repeat(30).trim();
    const label = callTreeLabel(
      span({
        runType: "chain",
        name: "",
        summary: long,
      }),
    );
    assert.ok(label.length <= 48);
    assert.ok(label.endsWith("…"));
  });
});
