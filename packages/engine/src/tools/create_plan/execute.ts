/**
 * create_plan 执行体：把模型给出的计划参数推成 plan/created 事件。
 *
 * 计划是结构化状态 —— 不落工作空间，也不从正文 / frontmatter 解析。
 * 计划必然产出待办，而待办是会话级能力：这里把计划待办写回会话待办，
 * 旧账未清时先问用户（合并 / 放弃 / 保留独立）再落地。
 */
import {
  type ChatPlanStatus,
  type ChatTodo,
  isPlanStatus,
  mergeTodos,
  normalizeTodos,
  unfinishedTodos,
} from "@thinker-workbench/shared";
import { requestHitl } from "../../hitl/requestHitl";
import { planIdForSession } from "../../plan/planId";
import { emitPlan, emitTodos } from "../../runtime/emitHelpers";
import { getRunTodos, setPlanOwnsTodos, setRunTodos } from "../../runtime/runContext";
import { getRunEmitter, getRunIds } from "../../runtime/runEmit";
import type { ToolArgs, ToolContext, ToolExecuteResult } from "../types";

/** 取文本入参；空白串视为未提供。 */
function readText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text : undefined;
}

/** 旧账未清时的处置方式。 */
type CarryOver = "merge" | "discard" | "keep";

/** 澄清题 id：答复按此定位。 */
const CARRY_QUESTION_ID = "carry_over";

/** 三个选项（顺序即 UI 展示顺序）。 */
const CARRY_OPTIONS: Array<{ id: CarryOver; label: string }> = [
  { id: "merge", label: "合并进新计划：旧待办排在前面，一起做完" },
  { id: "discard", label: "放弃旧待办：只执行新计划，旧待办清空" },
  { id: "keep", label: "保留为独立待办：新计划只管自己的步骤，旧待办继续挂在会话上" },
];

/**
 * 旧账未清时让用户选处置方式。
 * 取消 / 关闭对话框视为放弃本次创建（与 ask_user 一致）；答复读不出来时
 * 回落「合并」—— 保守选项，至少不会静默丢掉用户的旧待办。
 */
async function askCarryOver(
  unfinished: readonly ChatTodo[],
  signal: AbortSignal | undefined,
): Promise<CarryOver> {
  const preview = unfinished
    .slice(0, 5)
    .map((todo) => `- ${todo.label}`)
    .join("\n");
  const response = await requestHitl(
    {
      kind: "clarify",
      title: "Unfinished todos",
      body: `本会话还有 ${unfinished.length} 项未完成的待办：\n${preview}`,
      payload: {
        questions: [
          {
            id: CARRY_QUESTION_ID,
            prompt: `本会话还有 ${unfinished.length} 项未完成的待办，新计划要如何处理它们？`,
            options: CARRY_OPTIONS.map((option) => ({ id: option.id, label: option.label })),
            required: true,
          },
        ],
      },
      actions: [{ id: "submit", label: "Continue", style: "primary" }],
    },
    signal,
  );
  if (response.actionId !== "submit") throw new Error("Carry-over choice dismissed.");

  const rows = Array.isArray(response.values?.answers) ? response.values.answers : [];
  const hit = rows.find((row) => {
    if (!row || typeof row !== "object") return false;
    return (row as { id?: unknown }).id === CARRY_QUESTION_ID;
  }) as { optionId?: unknown } | undefined;
  const chosen = typeof hit?.optionId === "string" ? hit.optionId : "";
  if (chosen === "merge" || chosen === "discard" || chosen === "keep") return chosen;
  return "merge";
}

/**
 * 创建并覆盖会话活跃计划。
 * 状态缺省 ready（计划已成型待执行）；标题 / 简述缺省时由 UI 兜底。
 */
export async function createPlanTool(
  args: ToolArgs,
  ctx?: ToolContext,
): Promise<ToolExecuteResult> {
  if (!Array.isArray(args.todos)) {
    return { ok: false, output: "create_plan 需要 todos 数组；没有待办时传空数组。" };
  }
  const incoming = normalizeTodos(args.todos);
  const status: ChatPlanStatus = isPlanStatus(args.status) ? args.status : "ready";
  const title = readText(args.title);
  const description = readText(args.description);
  const markdown = typeof args.markdown === "string" ? args.markdown : "";

  // 旧账未清：先问用户怎么处置未完成待办，再决定计划待办与会话待办
  const sessionTodos = getRunTodos();
  const unfinished = unfinishedTodos(sessionTodos);
  let planTodos = incoming;
  let nextSessionTodos = incoming;
  if (unfinished.length > 0) {
    const choice = await askCarryOver(unfinished, ctx?.signal);
    if (choice === "merge") {
      planTodos = mergeTodos(sessionTodos, incoming);
      nextSessionTodos = planTodos;
    } else if (choice === "keep") {
      // 计划独立：会话待办保持原样，后续 update_plan 也不再覆写它
      planTodos = incoming;
      nextSessionTodos = sessionTodos;
      setPlanOwnsTodos(false);
    }
    // discard：计划待办即新列表，旧待办随之放弃
  }

  if (nextSessionTodos !== sessionTodos) {
    setRunTodos(nextSessionTodos);
    emitTodos(getRunEmitter(), { todos: nextSessionTodos, origin: "create_plan" });
  }

  emitPlan(getRunEmitter(), {
    phase: "created",
    planId: planIdForSession(getRunIds()?.sessionId),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    status,
    todos: planTodos,
    markdown,
  });
  return {
    output: `计划已创建：${title ?? "未命名"}（${planTodos.length} 个待办，status=${status}）。`,
  };
}
