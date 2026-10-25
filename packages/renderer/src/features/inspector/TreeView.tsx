/**
 * 共享文件树：文件面板与变更侧栏共用同一棵渲染。
 *
 * 两处差异通过 props 参数化：
 * - `showStats`：是否展示 +/- 变更行数（变更侧栏开，文件面板关）。
 * - `onActivate`：文件 / 目录各自的点击逻辑由调用方决定
 *   （文件面板多选 + 目录开关；变更侧栏目录开关 + 文件聚焦 diff）。
 * - `onMove`：传入即启用拖放移动；未传入时树不带任何拖拽行为。
 *
 * 渲染方式：先把树按展开状态摊平成一行数组，再交给虚拟列表 ——
 * 工作区全量树动辄上千行，全量挂载时一次面板宽度变化就要整表重排。
 * 摊平后只有视口内的十几行在 DOM 里，拖动 / 滚动都不再随规模变差。
 */

import {
  type CSSProperties,
  memo,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualRows } from "../../ui/hooks/useVirtualRows";
import { FileGlyph, IconChevron, IconFolder } from "../../ui/icons";
import type { ChangeTreeNode } from "./changesTree";

export type TreeGesture = { shift: boolean; toggle: boolean };
export type TreeSelectionJoin = { joinAbove: boolean; joinBelow: boolean };

/** 拖拽状态提升到树的顶层，递归各层共享同一份（否则每层各有一份悬停目标）。 */
export type TreeDragState = {
  /** 正在被拖动的路径；null 表示没有进行中的拖拽。 */
  dragPath: string | null;
  /** 当前悬停的落点目录；"" 表示工作空间根。 */
  dropTarget: string | null;
};

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

/** 未测量行的估算高度：padding 4.5×2 + 行高，与 .tree-file / .tree-dir 一致。 */
const TREE_ROW_ESTIMATE = 27;

/** 摊平后的一行。 */
type FlatRow = {
  node: ChangeTreeNode;
  depth: number;
  key: string;
};

function flattenTree(
  nodes: ChangeTreeNode[],
  openDirs: ReadonlySet<string>,
  depth: number,
  out: FlatRow[],
): void {
  for (const node of nodes) {
    if (node.kind === "dir") {
      out.push({ node, depth, key: `d:${node.path}` });
      if (openDirs.has(node.path) && node.children.length) {
        flattenTree(node.children, openDirs, depth + 1, out);
      }
    } else {
      out.push({ node, depth, key: node.path });
    }
  }
}

function rowClass(
  base: string,
  opts: {
    current?: boolean;
    open?: boolean;
    selected: boolean;
    join?: TreeSelectionJoin;
    dragging?: boolean;
    dropTarget?: boolean;
  },
): string {
  let className = base;
  if (opts.open) className += " is-open";
  if (opts.current) className += " is-current";
  if (opts.selected) {
    className += " is-selected";
    if (opts.join?.joinAbove) className += " is-select-join-above";
    if (opts.join?.joinBelow) className += " is-select-join-below";
  }
  if (opts.dragging) className += " is-dragging";
  if (opts.dropTarget) className += " is-drop-target";
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
  /** 拖放移动：把 source 移进 targetDir（"" = 工作空间根）。不传则不启用拖拽。 */
  onMove?: (source: string, targetDir: string) => void;
  /** 起始缩进层级；虚拟列表摊平后内部自己算深度，这里只作基线。 */
  depth?: number;
};

export const TreeView = memo(function TreeView({
  nodes,
  openDirs,
  onActivate,
  onContextMenu,
  selectedPaths,
  selectionJoins,
  focusPath,
  showStats = false,
  onMove,
  depth = 0,
}: TreeViewProps) {
  const [drag, setDrag] = useState<TreeDragState>({ dragPath: null, dropTarget: null });
  // Mac ctrl+click 会先触发 contextmenu；紧随其后的 click 需吞掉以免重复激活。
  const absorbedCtrlClickAt = useRef(0);
  const dropEnabled = Boolean(onMove);

  const rows = useMemo(() => {
    const out: FlatRow[] = [];
    flattenTree(nodes, openDirs, depth, out);
    return out;
  }, [nodes, openDirs, depth]);

  const v = useVirtualRows({
    count: rows.length,
    estimate: TREE_ROW_ESTIMATE,
    getKey: (i) => rows[i]?.key ?? String(i),
  });

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

  function handleDragStart(node: ChangeTreeNode, e: ReactDragEvent) {
    if (!dropEnabled) return;
    e.dataTransfer.setData("text/plain", node.path);
    e.dataTransfer.effectAllowed = "move";
    setDrag({ dragPath: node.path, dropTarget: null });
  }

  function handleDragEnd() {
    if (drag.dragPath) setDrag({ dragPath: null, dropTarget: null });
  }

  /**
   * 目录接收：在 dragover 上持续标记悬停目标。
   * 比 dragenter/dragleave 稳定——行内子元素不会造成高亮抖动。
   */
  function handleDragOverDir(e: ReactDragEvent, path: string) {
    if (!dropEnabled || !drag.dragPath) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (drag.dropTarget !== path) setDrag({ dragPath: drag.dragPath, dropTarget: path });
  }

  const sourceOf = useCallback(
    (e: ReactDragEvent): string => drag.dragPath || e.dataTransfer.getData("text/plain") || "",
    [drag.dragPath],
  );

  function handleDropDir(e: ReactDragEvent, path: string) {
    if (!dropEnabled || !onMove) return;
    e.preventDefault();
    e.stopPropagation();
    const source = sourceOf(e);
    setDrag({ dragPath: null, dropTarget: null });
    if (source) onMove(source, path);
  }

  /** 拖到树空白处 = 移到工作空间根。 */
  const onRootDragOver = useCallback(
    (e: ReactDragEvent) => {
      if (!dropEnabled || !drag.dragPath) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (drag.dropTarget !== "") setDrag({ dragPath: drag.dragPath, dropTarget: "" });
    },
    [dropEnabled, drag.dragPath, drag.dropTarget],
  );

  const onRootDrop = useCallback(
    (e: ReactDragEvent) => {
      if (!dropEnabled || !onMove) return;
      e.preventDefault();
      const source = sourceOf(e);
      setDrag({ dragPath: null, dropTarget: null });
      if (source) onMove(source, "");
    },
    [dropEnabled, onMove, sourceOf],
  );

  return (
    <div
      role="tree"
      className={rowClass("tree-scroller tree-root-drop", {
        selected: false,
        dropTarget: drag.dropTarget === "",
      })}
      ref={v.scrollRef}
      onDragOver={onRootDragOver}
      onDrop={onRootDrop}
    >
      <div className="tree-rows" style={{ height: v.contentHeight }}>
        {v.rows.map(({ index, offset }) => {
          const { node, depth: rowDepth } = rows[index];
          const indent = 6 + rowDepth * 12;
          const style: CSSProperties = {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${offset}px)`,
            paddingLeft: indent,
          };
          if (node.kind === "dir") {
            const open = openDirs.has(node.path);
            const selected = selectedPaths?.has(node.path) ?? false;
            return (
              <button
                key={`d:${node.path}`}
                type="button"
                ref={v.measureRef(index)}
                className={rowClass("tree-dir", {
                  open,
                  selected,
                  join: selectionJoins?.get(node.path),
                  dragging: drag.dragPath === node.path,
                  dropTarget: drag.dropTarget === node.path,
                })}
                style={style}
                data-tree-path={node.path}
                role="treeitem"
                aria-selected={selected}
                aria-expanded={open}
                draggable={dropEnabled}
                onDragStart={(e) => handleDragStart(node, e)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOverDir(e, node.path)}
                onDrop={(e) => handleDropDir(e, node.path)}
                onClick={(e) => handleClick(node, e)}
                onContextMenu={(e) => handleContextMenu(node, e)}
                title={node.path}
              >
                <span className="tree-chev">
                  <IconChevron open={open} />
                </span>
                <span className="tree-ico">
                  <IconFolder open={open} name={node.name} />
                </span>
                <span className="tree-name">{node.name}</span>
              </button>
            );
          }
          const selected = selectedPaths?.has(node.path) ?? false;
          return (
            <button
              key={node.path}
              type="button"
              ref={v.measureRef(index)}
              className={rowClass("tree-file", {
                current: focusPath === node.path,
                selected,
                join: selectionJoins?.get(node.path),
                dragging: drag.dragPath === node.path,
              })}
              style={style}
              data-tree-path={node.path}
              role="treeitem"
              aria-selected={selected}
              draggable={dropEnabled}
              onDragStart={(e) => handleDragStart(node, e)}
              onDragEnd={handleDragEnd}
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
      </div>
    </div>
  );
});
