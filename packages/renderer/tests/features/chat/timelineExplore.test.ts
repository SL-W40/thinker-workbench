/**
 * 探索分组：工具前的叙述留在外面，探索工具收成一段，改文件单独展示。
 */
import assert from "node:assert/strict";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  groupTimelineForDisplay,
  isExploreToolName,
  isMutationTool,
  isStandaloneTool,
} from "../../../src/features/chat/timelineExplore";

function tool(id: string, name: string, active = false): ChatTimelineStep {
  return { id, kind: "tool", name, phase: active ? "start" : "end", active };
}

describe("timeline explore grouping", () => {
  it("读和搜是探索，改文件和 shell 单独放", () => {
    assert.equal(isExploreToolName("read_file"), true);
    assert.equal(isExploreToolName("browser_screenshot"), true);
    assert.equal(isExploreToolName("shell"), false);
    assert.equal(isMutationTool("write_file"), true);
    assert.equal(isStandaloneTool("Task"), true);
    assert.equal(isStandaloneTool("grep"), false);
  });

  it("第一次探索前的正文不进组；之后的思考收进去；planning 丢掉", () => {
    const steps: ChatTimelineStep[] = [
      { id: "t0", kind: "text", text: "先看一下" },
      { id: "p", kind: "status", status: "planning", active: true },
      tool("r", "read_file"),
      { id: "th", kind: "status", status: "thinking", active: false, text: "看到了" },
      tool("w", "write_file"),
      { id: "t1", kind: "text", text: "改完了" },
    ];
    const items = groupTimelineForDisplay(steps);
    assert.equal(items[0]?.type, "step");
    if (items[0]?.type === "step") assert.equal(items[0].step.id, "t0");
    assert.equal(items[1]?.type, "explore");
    if (items[1]?.type === "explore") {
      assert.equal(items[1].fileCount, 1);
      assert.deepEqual(
        items[1].steps.map((s) => s.id),
        ["r", "th"],
      );
    }
    assert.equal(items[2]?.type, "step");
    if (items[2]?.type === "step") assert.equal(items[2].step.id, "w");
    assert.equal(items[3]?.type, "step");
    if (items[3]?.type === "step") assert.equal(items[3].step.id, "t1");
    assert.equal(
      items.some((item) => item.type === "step" && item.step.id === "p"),
      false,
    );
  });
});
