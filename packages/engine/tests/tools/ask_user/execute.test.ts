/**
 * ask_user 一次 HITL 带上全部题目，自定义回复写进工具结果。
 */
import assert from "node:assert/strict";
import type { UtilityToParent } from "@thinker-workbench/shared";
import { afterEach, describe, it } from "vitest";
import { resolveHitl } from "../../../src/hitl/requestHitl";
import { askUserTool } from "../../../src/tools/ask_user/execute";

type ParentPort = {
  postMessage: (message: unknown) => void;
  on: (event: "message", listener: (event: { data: unknown }) => void) => void;
};

const processWithPort = process as NodeJS.Process & { parentPort?: ParentPort };

describe("askUserTool", () => {
  afterEach(() => {
    delete processWithPort.parentPort;
  });

  it("挂起时 payload 含多道题，提交后按自定义回复返回", async () => {
    const messages: UtilityToParent[] = [];
    processWithPort.parentPort = {
      postMessage(message) {
        messages.push(message as UtilityToParent);
      },
      on() {},
    };
    const pending = askUserTool(
      {
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
              { id: "yes", label: "Yes, see my note" },
            ],
          },
        ],
      },
      { workspaceRoot: "C:/repo", signal: new AbortController().signal },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const sent = messages.find((m) => m.kind === "hitl");
    assert.ok(sent && sent.kind === "hitl");
    const request = sent.request;
    assert.equal(request.kind, "clarify");
    const questions = (request.payload as { questions?: unknown })?.questions;
    assert.equal(Array.isArray(questions) && questions.length, 2);
    resolveHitl({
      hitlId: request.hitlId,
      actionId: "submit",
      values: {
        answers: [
          { id: "plan", optionId: "a", text: "do both" },
          { id: "note", text: "keep tests" },
        ],
      },
    });
    const output = await pending;
    assert.match(output, /answer: do both/);
    assert.match(output, /option: Plan A/);
    assert.match(output, /answer: keep tests/);
  });
});
