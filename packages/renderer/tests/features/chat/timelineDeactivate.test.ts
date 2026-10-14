/**
 * deactivateAll 收束时摘掉 HITL 等待态。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { deactivateAll } from "../../../src/features/chat/timelineModel";

describe("deactivateAll HITL", () => {
  it("工具行去掉 hitl，active=false", () => {
    const next = deactivateAll([
      {
        kind: "tool",
        name: "shell",
        phase: "start",
        active: true,
        hitl: {
          hitlId: "h1",
          kind: "shell_approval",
          title: "Allow?",
          payload: {},
          actions: [{ id: "allow", label: "Allow" }],
          threadId: "t",
          runId: "r",
        },
      },
    ]);
    const tool = next[0];
    assert.equal(tool?.kind, "tool");
    if (tool?.kind !== "tool") return;
    assert.equal(tool.active, false);
    assert.equal(tool.hitl, undefined);
  });
});
