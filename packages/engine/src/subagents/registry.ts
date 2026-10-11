/**
 * 进程内子代理定义缓存（由 hello / reload 下发）。
 */
import type { SubagentDefinition } from "@thinker-workbench/shared";

let agents: SubagentDefinition[] = [];

/** 替换全部子代理定义。 */
export function setSubagentDefinitions(next: SubagentDefinition[] | undefined | null): void {
  agents = Array.isArray(next) ? next.map((a) => ({ ...a })) : [];
}

/** 列表副本。 */
export function listSubagentDefinitions(): SubagentDefinition[] {
  return agents.map((a) => ({ ...a }));
}

/** 按名查找。 */
export function getSubagentDefinition(name: string): SubagentDefinition | null {
  const key = name.trim().toLowerCase();
  return agents.find((a) => a.name.toLowerCase() === key) ?? null;
}

/** 写入父代理 system 的索引块。 */
export function getSubagentIndexText(): string {
  if (agents.length === 0) return "";
  const lines = agents.map(
    (a) =>
      `- ${a.name}: ${a.description || "(no description)"}${a.readonly ? " [readonly]" : ""}${a.isBackground ? " [background-ok]" : ""}`,
  );
  return [
    "## Available subagents (use Task to delegate; task_await for background results)",
    ...lines,
  ].join("\n");
}
