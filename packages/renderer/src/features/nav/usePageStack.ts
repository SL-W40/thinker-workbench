/**
 * 应用内页面栈 hook（前进 / 后退 / 重置），并跟踪「曾访问」集合以便懒挂载保活。
 *
 * 与浏览器 history 分离：栈状态在 React 内维护，hash 仅作书签 / 会话恢复。
 */
import { useState } from "react";
import type { PageStackSnapshot } from "@thinker-workbench/shared";

/** 可导航的主页面 id（`settings` 为旧 id，渲染层映射到控制台 `tools`）。 */
export type PageId = "chat" | "settings" | "components" | "tools";

type StackState = {
  entries: PageId[];
  index: number;
  visited: ReadonlySet<PageId>;
};

export type PageStack = {
  current: PageId;
  canBack: boolean;
  canForward: boolean;
  visited: ReadonlySet<PageId>;
  snapshot: PageStackSnapshot;
  push(page: PageId): void;
  /** 跳转且不追加历史（用于 hash 恢复 / hashchange）。 */
  replaceCurrent(page: PageId): void;
  /** 清空历史与保活页，落到 `page`（默认 chat）。 */
  reset(page?: PageId): void;
  back(): void;
  forward(): void;
};

const PAGE_IDS: PageId[] = ["chat", "settings", "components", "tools"];

function isPageId(value: string): value is PageId {
  return PAGE_IDS.includes(value as PageId);
}

/** 内部状态 → 可序列化快照（供 session 持久化）。 */
export function snapshotFromState(state: StackState): PageStackSnapshot {
  return {
    entries: [...state.entries],
    index: state.index,
    visited: [...state.visited],
  };
}

/**
 * 快照 → 内部状态；过滤非法 PageId，并保证 entries 非空。
 */
export function stateFromSnapshot(
  snapshot: PageStackSnapshot | null | undefined,
  fallback: PageId = "chat",
): StackState {
  const entries = (snapshot?.entries ?? []).filter(isPageId);
  const safeEntries = entries.length ? entries : [fallback];
  const index =
    typeof snapshot?.index === "number" &&
    snapshot.index >= 0 &&
    snapshot.index < safeEntries.length
      ? snapshot.index
      : safeEntries.length - 1;
  const visited = new Set<PageId>([
    ...((snapshot?.visited ?? []).filter(isPageId) as PageId[]),
    ...safeEntries,
  ]);
  return { entries: safeEntries, index, visited };
}

function createInitial(page: PageId): StackState {
  return {
    entries: [page],
    index: 0,
    visited: new Set([page]),
  };
}

/**
 * @param initial 起始页 id，或从 session 恢复的完整快照
 */
export function usePageStack(initial: PageId | PageStackSnapshot = "chat"): PageStack {
  const [state, setState] = useState<StackState>(() =>
    typeof initial === "string" ? createInitial(initial) : stateFromSnapshot(initial),
  );

  const current = state.entries[state.index] ?? "chat";

  return {
    current,
    canBack: state.index > 0,
    canForward: state.index < state.entries.length - 1,
    visited: state.visited,
    snapshot: snapshotFromState(state),
    push(page) {
      setState((prev) => {
        if (prev.entries[prev.index] === page) return prev;
        // 截断前进分支后追加，类似浏览器
        const entries = [...prev.entries.slice(0, prev.index + 1), page];
        const visited = prev.visited.has(page) ? prev.visited : new Set([...prev.visited, page]);
        return { entries, index: entries.length - 1, visited };
      });
    },
    replaceCurrent(page) {
      setState((prev) => {
        if (prev.entries[prev.index] === page) {
          if (prev.visited.has(page)) return prev;
          return { ...prev, visited: new Set([...prev.visited, page]) };
        }
        const entries = [...prev.entries];
        entries[prev.index] = page;
        const visited = prev.visited.has(page) ? prev.visited : new Set([...prev.visited, page]);
        return { entries, index: prev.index, visited };
      });
    },
    reset(page = "chat") {
      setState(createInitial(page));
    },
    back() {
      setState((prev) => (prev.index <= 0 ? prev : { ...prev, index: prev.index - 1 }));
    },
    forward() {
      setState((prev) =>
        prev.index >= prev.entries.length - 1 ? prev : { ...prev, index: prev.index + 1 },
      );
    },
  };
}
