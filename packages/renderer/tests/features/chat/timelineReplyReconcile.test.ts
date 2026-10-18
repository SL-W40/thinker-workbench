/**
 * done 正文比流式时间线长时，补上被截掉的尾巴。
 */
import assert from "node:assert/strict";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { reconcileTimelineReply } from "../../../src/features/chat/timelineModel";

describe("reconcileTimelineReply", () => {
  it("把截断的最后一句补全", () => {
    const steps: ChatTimelineStep[] = [
      { id: "t1", kind: "text", text: "已记录。\n\n现在等你提供这次" },
    ];
    const next = reconcileTimelineReply(
      steps,
      "已记录。\n\n现在等你提供这次要改的具体内容，我再开始。",
    );
    const step = next[0];
    assert.equal(step?.kind, "text");
    if (step?.kind !== "text") return;
    assert.equal(step.text, "已记录。\n\n现在等你提供这次要改的具体内容，我再开始。");
  });

  it("正文对不上已有叙述时不改时间线", () => {
    const steps: ChatTimelineStep[] = [{ id: "t1", kind: "text", text: "另一段" }];
    const next = reconcileTimelineReply(steps, "完全不同的答复");
    assert.equal(next, steps);
  });
});
