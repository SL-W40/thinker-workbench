/**
 * 计划领域逻辑：状态取值判定、活跃计划选取。
 *
 * 计划由 `create_plan` 工具以结构化参数产出，是严谨状态而非文本解析结果：
 * 不存在「从 markdown 正文 / frontmatter 里猜计划」的路径。
 * 计划默认不落用户工作空间，随会话快照持久化。
 *
 * 计划必然产出待办，但待办不属于计划：会话待办是独立能力，见 `./todo`。
 */
import type { ChatMessage, ChatPlan, ChatPlanStatus } from "./message";

/** 计划状态的合法取值。 */
export const PLAN_STATUSES: readonly ChatPlanStatus[] = ["draft", "ready", "building", "done"];

/** 判定是否为合法计划状态。 */
export function isPlanStatus(value: unknown): value is ChatPlanStatus {
  return typeof value === "string" && (PLAN_STATUSES as readonly string[]).includes(value);
}

/**
 * 取会话活跃计划：最后一条带 plan 的消息。
 * 新计划天然覆盖旧计划，无需额外维护会话级引用。
 */
export function activePlanOf(messages: readonly ChatMessage[]): ChatPlan | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const plan = messages[i]?.plan;
    if (plan) return plan;
  }
  return null;
}
