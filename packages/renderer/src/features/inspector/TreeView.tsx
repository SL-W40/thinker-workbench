/**
 * 共享文件树：文件面板与变更侧栏共用同一棵渲染。
 *
 * 两处差异通过 props 参数化：
 * - `showStats`：是否展示 +/- 变更行数（变更侧栏开，文件面板关）。
 * - `onActivate`：文件 / 目录各自的点击逻辑由调用方决定
 *   （文件面板多选 + 目录开关；变更侧栏目录开关 + 文件聚焦 diff）。
 */

import { type MouseEvent as ReactMouseEvent, useRef } from "react";
import type { ChangeTreeNode } from "./changesTree";
import { FileGlyph, IconChevron, IconFolder } from "./icons";

export type TreeGesture = { shift: boolean; toggle: boolean };
export type TreeSelectionJoin = { joinAbove: boolean; joinBelow: boolean };

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

function rowClass(
  base: string,
  opts: { current?: boolean; open?: boolean; selected: boolean; join?: TreeSelectionJoin },
): string {
  let className = base;
  if (opts.open) className += " is-open";
  if (opts.current) className += " is-current";
  if (opts.selected) {
    className += " is-selected";
    if (opts.join?.joinAbove) className += " is-select-join-above";
    if (opts.join?.joinBelow) className += " is-select-join-below";
  }
  return className;
}

export type TreeViewProps = {
  /** 已过滤的树节点（数组，无显式根节点）。 */
  nodes: ChangeTreeNode[];
  /** 已展开目录集合。 */
  openDirs: ReadonlySet<string>;
  /** 点击行：文件 / 目录各自的执行逻辑由调用方决定。 */
  onActivate: (node: ChangeTreeNode, gesture: TreeGesture) => void;
  /** 右键：统一为 (事件, 路径, 种类)。 */
  onContextMenu?: (e: ReactMouseEvent, path: string, kind: "file" | "dir") => void;
  /** 选中高亮路径集合（多选或单选）。 */
  selectedPaths?: ReadonlySet<string>;
  /** 多选连续块邻接标记（去掉相邻行圆角，连成整块）。 */
  selectionJoins?: ReadonlyMap<string, TreeSelectionJoin>;
  /** 当前聚焦文件（区别于选中，用于编辑器文件高亮）。 */
  focusPath?: string | null;
  /** 展示 +/- 变更行数；默认 false（文件面板不展示）。 */
  showStats?: boolean;
  depth?: number;
};

function TreeView({
  nodes,
  openDirs,
  onActivate,
  onContextMenu,
  selectedPaths,
  selectionJoins,
  focusPath,
  showStats = false,
  depth = 0,
}: TreeViewProps) {
  // Mac ctrl+click 会先触发 contextmenu；紧随其后的 click 需吞掉以免重复激活。
  const absorbedCtrlClickAt = useRef(0);

  function handleClick(node: ChangeTreeNode, e: ReactMouseEvent) {
    if (performance.now() - absorbedCtrlClickAt.current < 50) {
      absorbedCtrlClickAt.current = 0;
      return;
    }
    onActivate(node, { shift: e.shiftKey, toggle: e.metaKey || e.ctrlKey });
  }

  function handleContextMenu(node: ChangeTreeNode, e: ReactMouseEvent) {
    const macCtrlClick = isMac && e.ctrlKey && !e.metaKey && e.button !== 2;
    if (macCtrlClick) {
      e.preventDefault();
      e.stopPropagation();
      absorbedCtrlClickAt.current = performance.now();
      onActivate(node, { shift: e.shiftKey, toggle: true });
      return;
    }
    onContextMenu?.(e, node.path, node.kind);
  }

  return (
    <>
      {nodes.map((node) => {
        const indent = 6 + depth * 12;
        if (node.kind === "dir") {
          const open = openDirs.has(node.path);
          const selected = selectedPaths?.has(node.path) ?? false;
          return (
            <div key={`d:${node.path}`}>
              <button
                type="button"
                className={rowClass("tree-dir", {
                  open,
                  selected,
                  join: selectionJoins?.get(node.path),
                })}
                style={{ paddingLeft: indent }}
                data-tree-path={node.path}
                role="treeitem"
                aria-selected={selected}
                aria-expanded={open}
                onClick={(e) => handleClick(node, e)}
                onContextMenu={(e) => handleContextMenu(node, e)}
                title={node.path}
              >
                <span className="tree-chev">
                  <IconChevron open={open} />
                </span>
                <span className={`tree-ico ${open ? "tree-ico--open" : ""}`}>
                  <IconFolder open={open} />
                </span>
                <span className="tree-name">{node.name}</span>
              </button>
              {open && node.children.length ? (
                <TreeView
                  nodes={node.children}
                  openDirs={openDirs}
                  onActivate={onActivate}
                  onContextMenu={onContextMenu}
                  selectedPaths={selectedPaths}
                  selectionJoins={selectionJoins}
                  focusPath={focusPath}
                  showStats={showStats}
                  depth={depth + 1}
                />
              ) : null}
            </div>
          );
        }
        const selected = selectedPaths?.has(node.path) ?? false;
        return (
          <button
            key={node.path}
            type="button"
            className={rowClass("tree-file", {
              current: focusPath === node.path,
              selected,
              join: selectionJoins?.get(node.path),
            })}
            style={{ paddingLeft: indent }}
            data-tree-path={node.path}
            role="treeitem"
            aria-selected={selected}
            onClick={(e) => handleClick(node, e)}
            onContextMenu={(e) => handleContextMenu(node, e)}
            title={node.path}
          >
            <span className="tree-ico">
              <FileGlyph name={node.name} />
            </span>
            <span className="tree-name">{node.name}</span>
            {showStats ? (
              <span className="changes-filelist__stats">
                {node.added > 0 ? <span className="changes-pane__add">+{node.added}</span> : null}
                {node.removed > 0 ? (
                  <span className="changes-pane__del">−{node.removed}</span>
                ) : null}
                {!node.added && !node.removed && node.status ? (
                  <span className="changes-pane__status">{node.status}</span>
                ) : null}
              </span>
            ) : null}
          </button>
        );
      })}
    </>
  );
}

export { TreeView };
