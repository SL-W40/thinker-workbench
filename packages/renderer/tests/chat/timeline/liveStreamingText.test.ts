import assert from "node:assert/strict";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { isLiveStreamingTextStep } from "../../../src/features/chat/timeline/timelineLive";

describe("isLiveStreamingTextStep", () => {
  const steps: ChatTimelineStep[] = [
    { id: "t1", kind: "text", text: "先看快照" },
    { id: "tool1", kind: "tool", name: "browser_snapshot", phase: "end", active: false },
    { id: "t2", kind: "text", text: "再点搜索" },
  ];

  it("returns false when run is not live", () => {
    assert.equal(isLiveStreamingTextStep(steps, "t2", false), false);
  });

  it("only the trailing text step is live", () => {
    assert.equal(isLiveStreamingTextStep(steps, "t1", true), false);
    assert.equal(isLiveStreamingTextStep(steps, "t2", true), true);
  });

  it("no text caret when the last step is a tool", () => {
    const withTool: ChatTimelineStep[] = [
      ...steps,
      { id: "tool2", kind: "tool", name: "browser_click", phase: "start", active: true },
    ];
    assert.equal(isLiveStreamingTextStep(withTool, "t2", true), false);
  });
});
