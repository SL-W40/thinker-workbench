/**
 * ask_user 题目校验与答复排版。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  formatAskUserResult,
  parseAskUserAnswers,
  parseAskUserQuestions,
} from "../../../src/tools/ask_user/questions";

describe("parseAskUserQuestions", () => {
  it("缺题目时拒绝", () => {
    assert.throws(() => parseAskUserQuestions({}), /non-empty array/);
    assert.throws(() => parseAskUserQuestions({ questions: [] }), /non-empty array/);
  });

  it("每题必须有 2–5 个选项", () => {
    assert.throws(
      () => parseAskUserQuestions({ questions: [{ prompt: "Describe it" }] }),
      /2–5 options/,
    );
    assert.throws(
      () =>
        parseAskUserQuestions({
          questions: [{ prompt: "Which?", options: [{ label: "Only" }] }],
        }),
      /2–5 options/,
    );
    assert.throws(
      () =>
        parseAskUserQuestions({
          questions: [
            {
              prompt: "Which?",
              options: [
                { label: "a" },
                { label: "b" },
                { label: "c" },
                { label: "d" },
                { label: "e" },
                { label: "f" },
              ],
            },
          ],
        }),
      /2–5 options/,
    );
    const ok = parseAskUserQuestions({
      questions: [{ prompt: "Which?", options: [{ label: "A" }, { label: "B" }] }],
    });
    assert.equal(ok[0]?.options.length, 2);
  });
});

describe("formatAskUserResult", () => {
  const questions = parseAskUserQuestions({
    questions: [
      {
        id: "scope",
        prompt: "Which files?",
        options: [
          { id: "all", label: "All files" },
          { id: "one", label: "Just one" },
        ],
      },
    ],
  });

  it("自定义回复作为答案，选项仍附在结果里", () => {
    const answers = parseAskUserAnswers(questions, {
      answers: [{ id: "scope", optionId: "all", text: "only the tests" }],
    });
    const text = formatAskUserResult(questions, answers);
    assert.match(text, /answer: only the tests/);
    assert.match(text, /option: All files/);
  });

  it("只有选项时用选项标签作答案", () => {
    const answers = parseAskUserAnswers(questions, {
      answers: [{ id: "scope", optionId: "one" }],
    });
    assert.match(formatAskUserResult(questions, answers), /answer: Just one/);
  });

  it("未知选项或空答复拒绝", () => {
    assert.throws(
      () => parseAskUserAnswers(questions, { answers: [{ id: "scope", optionId: "nope" }] }),
      /unknown option/,
    );
    assert.throws(() => parseAskUserAnswers(questions, { answers: [] }), /custom reply/);
  });
});
