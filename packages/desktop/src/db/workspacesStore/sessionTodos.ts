/**
 * 会话待办的落库形态：chat_sessions.todos_json 一列 JSON 文本。
 *
 * 读写都走 shared 的 `normalizeTodos`，脏数据一律降级成空列表 / 合法结构，
 * 保证 UI 拿到的永远是合法待办。
 */
import { type ChatTodo, normalizeTodos } from "@thinker-workbench/shared";

/** 回读待办列；空列 / 非法 JSON / 结构不合法都视为空列表。 */
export function readSessionTodos(value: unknown): ChatTodo[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    return normalizeTodos(JSON.parse(value));
  } catch {
    return [];
  }
}

/** 待办序列化落库：空列表写 NULL，避免无意义的行内噪声。 */
export function writeSessionTodos(todos: readonly ChatTodo[]): string | null {
  const list = normalizeTodos(todos);
  return list.length > 0 ? JSON.stringify(list) : null;
}
