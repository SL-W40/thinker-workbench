/**
 * 多轮思考的时间线切分：每轮工具调用后的新一轮思考必须开新行，
 * 不得把整场 run 的思考追加进同一个块（曾导致时间线只有一条不断变长的思考）。
 * 迟到的 reasoning（思考行仍是最后一步）仍应续写原行。
 */
import assert from "node:assert/strict";
import type { ChatTimelineStep } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { appendThinkingText, applyToolEvent } from "../../../src/features/chat/timeline";

const toolStart = (callId: string, name = "read_file") =>
  ({
    type: "tool",
    phase: "start",
    name,
    callId,
    threadId: "th",
    runId: "r",
    ts: Date.now(),
  }) as const;

describe("多轮思考按轮切分", () => {
  it("工具调用后的新一轮思考开新行，不追加到旧块", () => {
    let steps: ChatTimelineStep[] = [];
    // 第一轮：思考 → 工具
    steps = appendThinkingText(steps, "第一轮思考内容");
    steps = applyToolEvent(steps, toolStart("c1"));
    // 第二轮：思考 → 工具
    steps = appendThinkingText(steps, "第二轮思考内容");
    steps = applyToolEvent(steps, toolStart("c2"));
    // 第三轮思考
    steps = appendThinkingText(steps, "第三轮思考内容");

    const thoughts = steps.filter(
      (s): s is Extract<ChatTimelineStep, { kind: "status" }> =>
        s.kind === "status" && s.status === "thinking",
    );
    assert.equal(thoughts.length, 3, "三轮思考应是三条独立时间线");
    assert.equal(thoughts[0]?.text, "第一轮思考内容");
    assert.equal(thoughts[1]?.text, "第二轮思考内容");
    assert.equal(thoughts[2]?.text, "第三轮思考内容");
    assert.equal(thoughts[2]?.active, true, "最新一轮应处于活动状态");
  });

  it("思考行仍是最后一步时，迟到 reasoning 续写原行", () => {
    let steps: ChatTimelineStep[] = [];
    steps = appendThinkingText(steps, "前半段");
    // 模拟思考行被 finalize（如 reply 收束）后，同段 reasoning 迟到到达
    steps = steps.map((s) =>
      s.kind === "status" && s.status === "thinking" ? { ...s, active: false } : s,
    );
    steps = appendThinkingText(steps, "，后半段");

    const thoughts = steps.filter((s) => s.kind === "status" && s.status === "thinking");
    assert.equal(thoughts.length, 1, "无工具隔开时应续写同一行");
    assert.equal(thoughts[0]?.kind === "status" && thoughts[0].text, "前半段，后半段");
  });

  it("末尾空壳思考被新一轮 thinking 重开而非叠新条", () => {
    let steps: ChatTimelineStep[] = [];
    steps = applyToolEvent(steps, toolStart("c0")); // 产生空壳已结束思考被丢弃，仅留工具
    steps = appendThinkingText(steps, "真实思考");
    const thoughts = steps.filter((s) => s.kind === "status" && s.status === "thinking");
    assert.equal(thoughts.length, 1);
    assert.equal(thoughts[0]?.kind === "status" && thoughts[0].text, "真实思考");
  });
});
