/**
 * 右侧 agent inspector 标签类型。
 */

export type StageTab =
  | { key: string; kind: "changes"; title: string }
  | { key: string; kind: "files"; title: string }
  | { key: string; kind: "terminal"; title: string }
  | { key: string; kind: "browser"; title: string }
  | { key: string; kind: "subagent"; title: string; taskId: string; subagent: string }
  /** 会话活跃计划的虚拟文档：内容取自 running plan，不落工作空间。 */
  | { key: string; kind: "plan"; title: string; planId: string }
  | { key: string; kind: "file"; title: string; path: string };

export const CHANGES_TAB_KEY = "changes";
export const FILES_TAB_KEY = "files";
export const TERMINAL_TAB_KEY = "terminal";
export const BROWSER_TAB_KEY = "browser";
