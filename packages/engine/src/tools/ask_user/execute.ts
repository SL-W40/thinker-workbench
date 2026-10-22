/**
 * ask_user：一次挂起，等用户答完所有澄清题再继续。
 */
import { requestHitl } from "../../hitl/requestHitl";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";
import { formatAskUserResult, parseAskUserAnswers, parseAskUserQuestions } from "./questions";

export async function askUserTool(args: ToolArgs, ctx: ToolContext): Promise<ToolExecuteResult> {
  const questions = parseAskUserQuestions(args);
  const response = await requestHitl(
    {
      kind: "clarify",
      title: "Need a clarification",
      body: questions.map((q) => q.prompt).join("\n"),
      payload: { questions },
      actions: [{ id: "submit", label: "Continue", style: "primary" }],
    },
    ctx.signal,
  );
  if (response.actionId !== "submit") {
    throw new Error("Clarification dismissed.");
  }
  const answers = parseAskUserAnswers(questions, response.values);
  return formatAskUserResult(questions, answers);
}
