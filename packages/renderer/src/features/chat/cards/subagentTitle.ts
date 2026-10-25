/**
 * 子代理 Task 展示标题：优先任务 title，否则类型名。
 * 「…」为流式占位，不当作真名。
 */
export function subagentDisplayTitle(step: { title?: string | null; subagent: string }): string {
  const title = typeof step.title === "string" ? step.title.trim() : "";
  if (title) return title;
  const name = step.subagent.trim();
  if (name && name !== "…") return name;
  return "Task";
}
