/**
 * 右侧 agent inspector 标签类型（对齐 v1，省略 Browser / Terminal 等）。
 */

export type StageTab =
  | { key: string; kind: "changes"; title: string }
  | { key: string; kind: "files"; title: string }
  | { key: string; kind: "file"; title: string; path: string };

export const CHANGES_TAB_KEY = "changes";
export const FILES_TAB_KEY = "files";
