/**
 * 右侧 agent inspector 标签类型。
 */

export type StageTab =
  | { key: string; kind: "changes"; title: string }
  | { key: string; kind: "files"; title: string }
  | { key: string; kind: "terminal"; title: string }
  | { key: string; kind: "browser"; title: string }
  | { key: string; kind: "file"; title: string; path: string };

export const CHANGES_TAB_KEY = "changes";
export const FILES_TAB_KEY = "files";
export const TERMINAL_TAB_KEY = "terminal";
export const BROWSER_TAB_KEY = "browser";
