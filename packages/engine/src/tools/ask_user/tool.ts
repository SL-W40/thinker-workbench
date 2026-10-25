/**
 * ask_user 工具规格。description / parameters 面向模型（英文）。
 */
import { defineTool } from "../defineTool";
import { askUserTool } from "./execute";

export const askUserToolSpec = defineTool({
  name: "ask_user",
  description: [
    "Ask the user one to four clarifying questions and wait for every answer before continuing.",
    "Use when the latest request has two or more interpretations that would change the result (which task, which scope, which approach), or the next step has several reasonable plans and picking the wrong one would waste a round of work.",
    "Do not use it for facts you can look up with tools, for reversible low-cost defaults, for shell approval, or to confirm every step.",
    "Put every question in this single call so they appear together. Do not ask the same thing again in chat text.",
    "Each question needs a prompt and 2–5 options. Do not send a question that only asks for free text. The user can still type a custom reply under the options, and a non-empty custom reply is the answer.",
    "After the tool returns, follow the answers and do not re-ask the same question.",
  ].join(" "),
  parameters: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description:
          "1–4 questions. Each item: { id, prompt, options: [{ id, label }] }. Every question needs 2–5 options. id fields may be omitted.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Stable id for this question." },
            prompt: { type: "string", description: "The question, in the user's language." },
            /**
             * 是否必答；缺省 true。
             * 有合理默认值、答不答都能继续的问题设 false —— UI 会给出「跳过」。
             */
            required: {
              type: "boolean",
              description:
                "Default true. Set false only when the question has a sane default and can be skipped.",
            },
            options: {
              type: "array",
              description: "Optional enumerable choices (2–5).",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Stable option id." },
                  label: { type: "string", description: "Option label shown to the user." },
                },
                required: ["label"],
              },
            },
          },
          required: ["prompt", "options"],
        },
      },
    },
    required: ["questions"],
  },
  execute: askUserTool,
});
