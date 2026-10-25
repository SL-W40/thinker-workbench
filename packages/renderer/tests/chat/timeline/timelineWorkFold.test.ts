/**
 * 已完成回合 Worked for 折叠：内外步划分与耗时格式。
 */
import assert from "node:assert/strict";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  filterTimelineExterior,
  formatWorkedForElapsed,
  isWorkFoldExteriorStep,
  shouldFoldWorkHistory,
  terminalReplyStartIndex,
  timelineHasFoldableWork,
} from "../../../src/features/chat/timeline/timelineWorkFold";

function text(id: string, body: string): ChatTimelineStep {
  return { id, kind: "text", text: body };
}

function tool(id: string, name = "read_file"): ChatTimelineStep {
  return {
    id,
    kind: "tool",
    name,
    phase: "end",
    active: false,
  };
}

function thought(id: string): ChatTimelineStep {
  return {
    id,
    kind: "status",
    status: "thinking",
    active: false,
    durationMs: 1200,
    text: "reasoning",
  };
}

function err(id: string): ChatTimelineStep {
  return { id, kind: "error", message: "Stopped.", code: "stopped" };
}

describe("timelineWorkFold", () => {
  it("仅有正文时不算可折叠工作", () => {
    assert.equal(timelineHasFoldableWork([text("t1", "hello")]), false);
  });

  it("有工具 / 思考则可折叠", () => {
    const steps = [thought("s1"), tool("k1"), text("t1", "ok")];
    assert.equal(timelineHasFoldableWork(steps), true);
    assert.equal(isWorkFoldExteriorStep(steps, "k1"), false);
    assert.equal(isWorkFoldExteriorStep(steps, "t1"), true);
  });

  it("中间小结折叠，只外露末尾正式答复与错误", () => {
    const steps: ChatTimelineStep[] = [
      thought("s1"),
      tool("k1"),
      text("t1", "中间小结"),
      tool("k2"),
      text("t2", "正式答复"),
      err("e1"),
    ];
    assert.equal(terminalReplyStartIndex(steps), 4);
    assert.deepEqual(
      filterTimelineExterior(steps).map((s) => s.id),
      ["t2", "e1"],
    );
    assert.equal(isWorkFoldExteriorStep(steps, "t1"), false);
    assert.equal(isWorkFoldExteriorStep(steps, "t2"), true);
  });

  it("末尾连续多段 text 都算正式答复", () => {
    const steps = [tool("k1"), text("t1", "a"), text("t2", "b")];
    assert.equal(terminalReplyStartIndex(steps), 1);
    assert.deepEqual(
      filterTimelineExterior(steps).map((s) => s.id),
      ["t1", "t2"],
    );
  });

  it("planning 占位不计入可折叠工作", () => {
    const planning: ChatTimelineStep = {
      id: "p1",
      kind: "status",
      status: "planning",
      active: true,
    };
    assert.equal(timelineHasFoldableWork([planning]), false);
  });

  it("耗时格式与 usage 底栏一致；未知展示「—」而非 0s", () => {
    assert.equal(formatWorkedForElapsed(110_000), "1m 50s");
    assert.equal(formatWorkedForElapsed(45_000), "45s");
    assert.equal(formatWorkedForElapsed(968), "<1s");
    assert.equal(formatWorkedForElapsed(0), "0s");
    assert.equal(formatWorkedForElapsed(undefined), "—");
  });

  it("折叠时机：重开历史折、刚跑完末条不折、跟随后折", () => {
    assert.equal(
      shouldFoldWorkHistory({
        live: false,
        hasWork: true,
        livedInSession: false,
        trailing: true,
      }),
      true,
      "重开末条",
    );
    assert.equal(
      shouldFoldWorkHistory({
        live: false,
        hasWork: true,
        livedInSession: true,
        trailing: true,
      }),
      false,
      "刚跑完仍末条",
    );
    assert.equal(
      shouldFoldWorkHistory({
        live: false,
        hasWork: true,
        livedInSession: true,
        trailing: false,
      }),
      true,
      "发出跟随后",
    );
    assert.equal(
      shouldFoldWorkHistory({
        live: true,
        hasWork: true,
        livedInSession: true,
        trailing: true,
      }),
      false,
      "进行中",
    );
  });
});
