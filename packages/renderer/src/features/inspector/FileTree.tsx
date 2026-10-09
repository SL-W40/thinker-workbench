/**
 * 工作空间文件树：展开 / 打开 / 多选；右键菜单精简为打开与新建。
 */
import type { WorkspaceNode } from "@thinker-workbench/shared";
import { type MouseEvent as ReactMouseEvent, useRef } from "react";
import { FileGlyph, IconChevron, IconFolder } from "./icons";
import { sortTreeNodes, type TreeSelectGesture } from "./treeSelection";

type SelectionJoin = { joinAbove: boolean; joinBelow: boolean };

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

function selectedRowClass(
  base: string,
  opts: {
    current?: boolean;
    open?: boolean;
    selected: boolean;
    join?: SelectionJoin;
  },
) {
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

export function FileTree({
  node,
  onSelect,
  openDirs,
  onContextMenu,
  focusPath,
  selectedPaths,
  selectionJoins,
  depth = 0,
}: {
  node: WorkspaceNode;
  onSelect: (node: WorkspaceNode, gesture: TreeSelectGesture) => void;
  openDirs: Set<string>;
  onContextMenu: (e: ReactMouseEvent, node: WorkspaceNode) => void;
  focusPath?: string | null;
  selectedPaths: ReadonlySet<string>;
  selectionJoins?: ReadonlyMap<string, SelectionJoin>;
  depth?: number;
}) {
  // Mac ctrl+click 会先触发 contextmenu；紧随其后的 click 需吞掉以免重复选中。
  const absorbedCtrlClickAt = useRef(0);
  const indent = 6 + depth * 12;

  function selectFromClick(e: ReactMouseEvent) {
    if (performance.now() - absorbedCtrlClickAt.current < 50) {
      absorbedCtrlClickAt.current = 0;
      return;
    }
    onSelect(node, {
      shift: e.shiftKey,
      toggle: e.metaKey || e.ctrlKey,
    });
  }

  function contextFromRow(e: ReactMouseEvent) {
    const macCtrlClick = isMac && e.ctrlKey && !e.metaKey && e.button !== 2;
    if (macCtrlClick) {
      e.preventDefault();
      e.stopPropagation();
      absorbedCtrlClickAt.current = performance.now();
      onSelect(node, { shift: e.shiftKey, toggle: true });
      return;
    }
    onContextMenu(e, node);
  }

  if (node.type === "file") {
    const selected = selectedPaths.has(node.path);
    return (
      <button
        type="button"
        className={selectedRowClass("tree-file", {
          current: node.path === focusPath,
          selected,
          join: selectionJoins?.get(node.path),
        })}
        style={{ paddingLeft: indent }}
        data-tree-path={node.path}
        aria-selected={selected}
        onClick={selectFromClick}
        onContextMenu={contextFromRow}
        title={node.path}
      >
        <span className="tree-ico">
          <FileGlyph name={node.name} />
        </span>
        <span className="tree-name">{node.name}</span>
      </button>
    );
  }

  // 工作空间根自身不渲染行；子节点从 depth 0 起。
  if (node.path === ".") {
    return (
      <>
        {sortTreeNodes(node.children ?? []).map((c) => (
          <FileTree
            key={c.path}
            node={c}
            onSelect={onSelect}
            openDirs={openDirs}
            onContextMenu={onContextMenu}
            focusPath={focusPath}
            selectedPaths={selectedPaths}
            selectionJoins={selectionJoins}
            depth={depth}
          />
        ))}
      </>
    );
  }

  const open = openDirs.has(node.path);
  const selected = selectedPaths.has(node.path);
  return (
    <div>
      <button
        type="button"
        className={selectedRowClass("tree-dir", {
          open,
          selected,
          join: selectionJoins?.get(node.path),
        })}
        style={{ paddingLeft: indent }}
        data-tree-path={node.path}
        aria-selected={selected}
        aria-expanded={open}
        onClick={selectFromClick}
        onContextMenu={contextFromRow}
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
      {open &&
        sortTreeNodes(node.children ?? []).map((c) => (
          <FileTree
            key={c.path}
            node={c}
            onSelect={onSelect}
            openDirs={openDirs}
            onContextMenu={onContextMenu}
            focusPath={focusPath}
            selectedPaths={selectedPaths}
            selectionJoins={selectionJoins}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}
