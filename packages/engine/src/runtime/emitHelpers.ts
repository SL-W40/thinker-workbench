/**
 * 向当前 run 的 emitter 推送产品事件的便捷封装。
 */
import type { ChatPlanStatus, ChatPlanTodo, ChatTodo } from "@thinker-workbench/shared";
import type { RunEmitter } from "./runEmit";

/** 推送计划事件：参数流式中的草稿、计划成型（created）与执行阶段更新（updated）。 */
export function emitPlan(
  emit: RunEmitter | undefined | null,
  event: {
    phase: "drafting" | "created" | "updated";
    planId: string;
    callId?: string;
    title?: string;
    description?: string;
    status: ChatPlanStatus;
    todos: ChatPlanTodo[];
    markdown?: string;
  },
): void {
  emit?.({ type: "plan", ...event });
}

/**
 * 推送会话待办事件：全量替换（幂等）。
 * 真值随后由消费端落进会话记录；这里只负责把本轮镜像同步出去。
 */
export function emitTodos(
  emit: RunEmitter | undefined | null,
  event: {
    todos: ChatTodo[];
    origin?: "todo" | "create_plan" | "update_plan";
  },
): void {
  emit?.({ type: "todo", ...event });
}
