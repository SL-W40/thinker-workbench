/** 文件树排序与多选（Shift / Ctrl）手势。 */
import type { WorkspaceNode } from "@thinker-workbench/shared";

export type TreeSelectGesture = {
  shift: boolean;
  toggle: boolean;
};

/** 目录优先，再按文件名排序（与树渲染顺序一致）。 */
export function sortTreeNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

/**
 * 按查询过滤工作空间树；匹配文件/目录时保留祖先路径，并收集需展开的目录。
 */
export function filterWorkspaceTree(
  root: WorkspaceNode | null,
  query: string,
): { root: WorkspaceNode | null; expandPaths: Set<string> } {
  const q = query.trim().toLowerCase();
  if (!root || !q) return { root, expandPaths: new Set() };

  const expandPaths = new Set<string>();

  function walk(node: WorkspaceNode): WorkspaceNode | null {
    if (node.type === "file") {
      const hit =
        node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q);
      return hit ? node : null;
    }

    const kids: WorkspaceNode[] = [];
    for (const child of node.children ?? []) {
      const kept = walk(child);
      if (kept) kids.push(kept);
    }

    const selfMatch =
      node.path !== "." &&
      (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q));

    if (!kids.length && !selfMatch) return null;

    if (kids.length && node.path !== ".") {
      let p = node.path;
      while (p) {
        expandPaths.add(p);
        const i = p.lastIndexOf("/");
        p = i >= 0 ? p.slice(0, i) : "";
      }
    }

    return {
      ...node,
      children: kids.length ? kids : selfMatch ? node.children : [],
    };
  }

  return { root: walk(root), expandPaths };
}

/** 当前可见行路径（自上而下）；工作空间根本身不占一行。 */
export function visibleTreePaths(
  root: WorkspaceNode | null,
  openDirs: ReadonlySet<string>,
): string[] {
  if (!root) return [];
  const out: string[] = [];
  const walk = (node: WorkspaceNode) => {
    if (node.path === ".") {
      for (const child of sortTreeNodes(node.children ?? [])) walk(child);
      return;
    }
    out.push(node.path);
    if (node.type === "dir" && openDirs.has(node.path)) {
      for (const child of sortTreeNodes(node.children ?? [])) walk(child);
    }
  };
  walk(root);
  return out;
}

/**
 * 连续多选的上下邻接标记，供样式去掉相邻行圆角，连成一整块而非锯齿。
 */
export function selectionJoinFlags(
  visible: readonly string[],
  selected: ReadonlySet<string>,
): ReadonlyMap<string, { joinAbove: boolean; joinBelow: boolean }> {
  const flags = new Map<string, { joinAbove: boolean; joinBelow: boolean }>();
  for (let i = 0; i < visible.length; i++) {
    const path = visible[i]!;
    if (!selected.has(path)) continue;
    flags.set(path, {
      joinAbove: i > 0 && selected.has(visible[i - 1]!),
      joinBelow: i < visible.length - 1 && selected.has(visible[i + 1]!),
    });
  }
  return flags;
}

function orderSelection(visible: readonly string[], set: Set<string>): string[] {
  const inView = visible.filter((path) => set.has(path));
  const hidden = [...set].filter((path) => !visible.includes(path));
  return [...inView, ...hidden];
}

/**
 * 资源管理器式选择：单击替换；Ctrl/⌘ 切换单行；
 * Shift 选中锚点到当前的可见范围；Ctrl/⌘+Shift 在原有基础上并入该范围。
 */
export function applyTreeSelection(input: {
  visible: readonly string[];
  selected: readonly string[];
  anchor: string | null;
  path: string;
  toggle: boolean;
  range: boolean;
}): { selected: string[]; anchor: string | null } {
  const { visible, selected, anchor, path, toggle, range } = input;
  if (range) {
    const from = anchor && visible.includes(anchor) ? anchor : path;
    const start = visible.indexOf(from);
    const end = visible.indexOf(path);
    if (start < 0 || end < 0) {
      if (toggle) {
        const set = new Set(selected);
        set.add(path);
        return { selected: orderSelection(visible, set), anchor: path };
      }
      return { selected: [path], anchor: path };
    }
    const [lo, hi] = start < end ? [start, end] : [end, start];
    const slice = visible.slice(lo, hi + 1);
    if (toggle) {
      const set = new Set(selected);
      for (const item of slice) set.add(item);
      return { selected: orderSelection(visible, set), anchor: from };
    }
    return { selected: slice, anchor: from };
  }
  if (toggle) {
    const set = new Set(selected);
    if (set.has(path)) set.delete(path);
    else set.add(path);
    return { selected: orderSelection(visible, set), anchor: path };
  }
  return { selected: [path], anchor: path };
}

/** 若已选祖先目录覆盖该路径，则丢掉子路径。 */
export function collapseNestedPaths(paths: readonly string[]): string[] {
  const sorted = [...paths].sort();
  const kept: string[] = [];
  for (const path of sorted) {
    const covered = kept.some((parent) => path === parent || path.startsWith(`${parent}/`));
    if (!covered) kept.push(path);
  }
  return kept;
}
