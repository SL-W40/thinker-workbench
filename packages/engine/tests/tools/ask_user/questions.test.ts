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

describe("选答题（required: false）", () => {
  const questions = parseAskUserQuestions({
    questions: [
      { id: "must", prompt: "Which file?", options: [{ label: "A" }, { label: "B" }] },
      {
        id: "maybe",
        prompt: "Any preference?",
        options: [{ label: "Fast" }, { label: "Fancy" }],
        required: false,
      },
    ],
  });

  it("未写 required 的题按必答解析", () => {
    assert.equal(questions[0]?.required, true);
    assert.equal(questions[1]?.required, false);
  });

  it("选答题没答就跳过，不进结果", () => {
    const answers = parseAskUserAnswers(questions, {
      answers: [{ id: "must", optionId: "opt_1" }],
    });
    assert.equal(answers.length, 1);
    assert.equal(answers[0]?.id, "must");
  });

  it("必答题没答仍然报错", () => {
    assert.throws(
      () => parseAskUserAnswers(questions, { answers: [{ id: "maybe", optionId: "opt_1" }] }),
      /custom reply/,
    );
  });

  it("排版里把跳过的题标成 skipped", () => {
    const answers = parseAskUserAnswers(questions, {
      answers: [{ id: "must", optionId: "opt_1" }],
    });
    const text = formatAskUserResult(questions, answers);
    assert.match(text, /answer: \(skipped\)/);
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
