/**
 * clarify 一次挂多道题到时间线，不走 Modal。
 */
import assert from "node:assert/strict";
import type { ChatTimelineStep, HitlRequest } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  applyHitlRequest,
  applyHitlResolved,
  isTimelineHitlKind,
} from "../../../src/features/chat/timeline";

describe("clarify timeline", () => {
  const request: HitlRequest = {
    hitlId: "hitl_c",
    kind: "clarify",
    threadId: "t",
    runId: "r",
    title: "Need a clarification",
    body: "Which plan?\nAnything else?",
    payload: {
      questions: [
        {
          id: "plan",
          prompt: "Which plan?",
          options: [
            { id: "a", label: "Plan A" },
            { id: "b", label: "Plan B" },
          ],
        },
        {
          id: "note",
          prompt: "Anything else?",
          options: [
            { id: "no", label: "No" },
            { id: "yes", label: "Yes" },
          ],
        },
      ],
    },
    actions: [{ id: "submit", label: "Continue", style: "primary" }],
  };

  it("一次请求把多道题挂到已有 ask_user 步骤", () => {
    const steps: ChatTimelineStep[] = [
      {
        id: "tl1",
        kind: "tool",
        name: "ask_user",
        phase: "start",
        active: true,
      },
    ];
    const next = applyHitlRequest(steps, request);
    assert.equal(next.length, 1);
    const step = next[0];
    assert.equal(step?.kind, "tool");
    if (step?.kind !== "tool") return;
    assert.equal(step.clarify?.questions.length, 2);
    assert.equal(step.clarify?.questions[1]?.options.length, 2);
    assert.equal(isTimelineHitlKind("clarify"), true);
    assert.equal(isTimelineHitlKind("secret"), false);
  });

  it("required 缺省必答，显式 false 才是可跳过", () => {
    const withOptional: HitlRequest = {
      ...request,
      payload: {
        questions: [
          { id: "plan", prompt: "Which plan?", options: [{ label: "A" }, { label: "B" }] },
          {
            id: "note",
            prompt: "Anything else?",
            options: [{ label: "No" }, { label: "Yes" }],
            required: false,
          },
        ],
      },
    };
    const next = applyHitlRequest([], withOptional);
    const step = next[0];
    if (step?.kind !== "tool") return;
    assert.equal(step.clarify?.questions[0]?.required, true);
    assert.equal(step.clarify?.questions[1]?.required, false);
  });

  it("旧账处置的询问挂在正在跑的 create_plan 卡上，不另开 ask_user", () => {
    const steps: ChatTimelineStep[] = [
      { id: "tl1", kind: "tool", name: "create_plan", phase: "start", active: true },
    ];
    const next = applyHitlRequest(steps, {
      ...request,
      payload: {
        questions: [
          {
            id: "carry_over",
            prompt: "旧待办怎么处理？",
            options: [
              { id: "merge", label: "合并" },
              { id: "discard", label: "放弃" },
            ],
          },
        ],
      },
    });
    assert.equal(next.length, 1);
    const step = next[0];
    if (step?.kind !== "tool") return;
    assert.equal(step.name, "create_plan");
    assert.equal(step.clarify?.questions[0]?.id, "carry_over");
  });

  it("提交后保留选项和自定义回复，卡片不再处于等待", () => {
    const attached = applyHitlRequest(
      [{ id: "tl1", kind: "tool", name: "ask_user", phase: "start", active: true }],
      request,
    );
    const settled = applyHitlResolved(attached, "hitl_c", "submit", {
      answers: [
        { id: "plan", optionId: "b", text: "actually neither" },
        { id: "note", text: "ship it" },
      ],
    });
    const step = settled[0];
    assert.equal(step?.kind, "tool");
    if (step?.kind !== "tool") return;
    assert.equal(step.active, false);
    assert.equal(step.clarify?.answers?.[0]?.optionId, "b");
    assert.equal(step.clarify?.answers?.[0]?.text, "actually neither");
    assert.equal(step.clarify?.answers?.[1]?.text, "ship it");
  });
});
