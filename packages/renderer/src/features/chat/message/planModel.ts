/**
 * 计划事件 → 消息状态的纯合并逻辑（会话级活跃计划）。
 *
 * - created：落到本轮产出的助手消息（plan 模式的回复气泡）。
 * - updated：落到会话活跃计划（最后一条带 plan 的消息），
 *   因为执行阶段的 update_plan 发生在**新的 run**，当前直播气泡不是计划所在消息。
 */
import type { AgentPlanEvent, ChatMessage, ChatPlan, ChatTodo } from "@thinker-workbench/shared";

/**
 * 由事件载荷构造结构化计划。
 * updated 常只带部分字段，缺省项（标题 / 正文）沿用已有计划，避免被清空。
 * drafting 不带正文，沿用上一次（若有）。
 */
export function planStateFromEvent(event: AgentPlanEvent, prev: ChatPlan | undefined): ChatPlan {
  const title = event.title ?? prev?.title;
  const description = event.description ?? prev?.description;
  return {
    id: event.planId,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    status: event.status,
    todos: event.todos,
    markdown: event.markdown ?? prev?.markdown ?? "",
  };
}

/** created：把计划挂到目标助手消息。 */
export function applyPlanCreated(
  messages: readonly ChatMessage[],
  targetId: string,
  event: AgentPlanEvent,
): ChatMessage[] {
  return messages.map((m) =>
    m.id === targetId ? { ...m, plan: planStateFromEvent(event, m.plan) } : m,
  );
}

/**
 * 会话待办变更 → 投影到活跃计划。
 *
 * 计划拥有会话待办时（两份清单的 id 有交集），它们本就是同一份待办：
 * 状态、文案、增删都要跟着走，否则右侧计划文档 / 时间线计划的进度会和
 * 输入框上方的会话待办对不上。
 * 「保留独立」的计划（id 完全不同）不参与同步，避免自己的步骤被会话待办吃掉。
 */
export function applySessionTodosToPlan(
  messages: readonly ChatMessage[],
  todos: readonly ChatTodo[],
): ChatMessage[] {
  const byId = new Map(todos.map((todo) => [todo.id, todo]));
  let changed = false;
  const next = messages.map((m) => {
    const plan = m.plan;
    if (!plan || plan.todos.length === 0) return m;
    if (!plan.todos.some((todo) => byId.has(todo.id))) return m;
    // 计划里的步骤按会话待办刷新；被删掉的随之消失，新增的并入
    const merged = plan.todos
      .filter((todo) => byId.has(todo.id))
      .map((todo) => byId.get(todo.id) ?? todo);
    for (const todo of todos) {
      if (!plan.todos.some((step) => step.id === todo.id)) merged.push(todo);
    }
    changed = true;
    return { ...m, plan: { ...plan, todos: merged } };
  });
  return changed ? next : (messages as ChatMessage[]);
}

/** updated：更新会话活跃计划；会话内还没有计划时原样返回。 */
export function applyPlanUpdated(
  messages: readonly ChatMessage[],
  event: AgentPlanEvent,
): ChatMessage[] {
  let target = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.plan) {
      target = i;
      break;
    }
  }
  if (target < 0) return [...messages];
  return messages.map((m, i) =>
    i === target ? { ...m, plan: planStateFromEvent(event, m.plan) } : m,
  );
}
