/**
 * Changes 侧栏文件列表与改动文件行（懒加载 diff + 离屏卸载）。
 *
 * 主列表在外层做了虚拟化（见 ChangesPane），只有视口内的行会挂进 DOM，
 * 所以「展开」状态必须提到父级持有 —— 行一旦滚出窗口就卸载，
 * 放在行内的 useState 会连同展开状态一起丢掉。
 */

import { ContextMenu, Input } from "@thinker-workbench/design/react";
import type {
  ChangeDispositionKind,
  GitChangedFile,
  WorkspaceNode,
} from "@thinker-workbench/shared";
import {
  type CSSProperties,
  memo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { workspaceGitFileDiff } from "../../../platform/ipc/workspaceFs";
import { useStableCallback } from "../../../ui/hooks/useStableCallback";
import { useT } from "../../../ui/i18n/useI18n";
import { FileGlyph, IconCheck, IconChevron, IconUndo, MI } from "../../../ui/icons";
import {
  buildChangeTree,
  buildFullTree,
  type ChangeTreeNode,
  filterChangeTree,
} from "../changesTree";
import { FileTreeActionModals, useFileTreeActions } from "../FileTreeActions";
import { TreeView } from "../TreeView";
import { FILE_LIST_WIDTH } from "../useFileListPanel";
import { copyRelativePath } from "./clipboard";
import { FileDiffBody } from "./FileDiff";
import { acquireDiffFetch, releaseDiffFetch } from "./highlightQueue";

export const ChangedFileRow = memo(function ChangedFileRow({
  workspaceId,
  path,
  added,
  removed,
  status,
  onOpenFile,
  open,
  onToggleOpen,
  wordWrap,
  onDispose,
  disposeBusy,
  measureRef,
  style,
}: {
  workspaceId: string;
  path: string;
  added: number;
  removed: number;
  status: string;
  onOpenFile: (path: string) => void;
  /** 是否展开 diff；由父级持有，行滚出虚拟窗口后回来仍是展开的。 */
  open: boolean;
  /** 切换展开：带 path 是为了让引用能恒定，不击穿行上的 memo。 */
  onToggleOpen: (path: string) => void;
  wordWrap: boolean;
  /** 行级处置（回滚 / 采纳）；不传则不渲染这两个按钮。 */
  onDispose?: (kind: ChangeDispositionKind, path: string) => void | Promise<void>;
  /** 处置进行中：禁用行按钮，避免重复点击。 */
  disposeBusy?: boolean;
  /** 虚拟列表测量 ref（与行内 ref 合并）。 */
  measureRef?: (node: HTMLLIElement | null) => void;
  /** 虚拟列表定位（translateY）。 */
  style?: CSSProperties;
}) {
  const [inView, setInView] = useState(false);
  const [full, setFull] = useState(false);
  const [patch, setPatch] = useState<string | null>(null);
  const [binary, setBinary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [spacerHeight, setSpacerHeight] = useState<number | null>(null);
  const t = useT();
  const rowRef = useRef<HTMLLIElement | null>(null);
  const diffWrapRef = useRef<HTMLDivElement>(null);
  const patchRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  patchRef.current = patch;

  // 行内 ref 与虚拟列表的测量 ref 合并：两者都要拿到同一个节点
  const setRowNode = useCallback(
    (node: HTMLLIElement | null) => {
      rowRef.current = node;
      measureRef?.(node);
    },
    [measureRef],
  );

  // useCallback 包一层：effect 依赖里要用稳定引用，避免每次渲染重跑
  const loadDiff = useCallback(
    async (nextFull: boolean) => {
      if (!nextFull) {
        if (loadingRef.current || patchRef.current !== null) return;
        loadingRef.current = true;
        setLoading(true);
      } else {
        setLoadingFull(true);
      }
      setErr(null);
      await acquireDiffFetch();
      try {
        if (!nextFull && patchRef.current !== null) return;
        const res = await workspaceGitFileDiff(workspaceId, path, nextFull);
        setPatch(res.patch);
        setBinary(res.binary);
        setFull(nextFull);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        releaseDiffFetch();
        if (!nextFull) loadingRef.current = false;
        setLoading(false);
        setLoadingFull(false);
      }
    },
    [workspaceId, path],
  );

  // 跟踪是否在滚动容器视口附近：离屏卸载 diff DOM，保留高度占位防跳动。
  useEffect(() => {
    if (!open) {
      setInView(false);
      return;
    }
    const el = rowRef.current;
    if (!el) return;
    const root = el.closest(".changes-pane__scroller");
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (cancelled) return;
        const next = entries.some((e) => e.isIntersecting);
        startTransition(() => setInView(next));
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: "120px 0px",
        threshold: 0,
      },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [open]);

  // 列表首次加载或清空搜索时，默认展开顶层目录。
  useEffect(() => {
    if (!open || !inView || patch !== null || loadingRef.current) return;
    void loadDiff(false);
  }, [open, inView, patch, loadDiff]);

  // 离屏前记下高度，挂占位避免滚动条跳动。
  useLayoutEffect(() => {
    if (!open) {
      setSpacerHeight(null);
      return;
    }
    if (inView && diffWrapRef.current) {
      setSpacerHeight(diffWrapRef.current.offsetHeight);
    }
  }, [open, inView]);

  const showDiff = open && inView && (loading || patch !== null || err);
  const showSpacer =
    open && !inView && spacerHeight != null && spacerHeight > 0 && (patch !== null || err != null);

  return (
    <li
      ref={setRowNode}
      className={`changes-pane__item${open ? " is-open" : ""}`}
      data-path={path}
      style={style}
    >
      <div className="changes-pane__file-row">
        <button
          type="button"
          className="changes-pane__toggle"
          onClick={() => onToggleOpen(path)}
          title={open ? t("inspector.changes.collapseDiff") : t("inspector.changes.expandDiff")}
          aria-expanded={open}
          aria-label={
            open ? t("inspector.changes.collapseDiff") : t("inspector.changes.expandDiff")
          }
        >
          <span className="changes-pane__lead" aria-hidden>
            <span className="changes-pane__file-ico">
              <FileGlyph name={path.split("/").pop() || path} />
            </span>
            <span className="changes-pane__chev">
              {/* 16px 的方框里塞 10px 的箭头太细弱，撑到 14px 才跟文件图标一个分量 */}
              <IconChevron open={open} size={14} />
            </span>
          </span>
        </button>
        <button type="button" className="changes-pane__file-name" onClick={() => onOpenFile(path)}>
          {path}
        </button>
        {/* 状态与 +/− 行数同一行并列：状态说明改动性质，数字说明改动量，缺一个都得靠猜 */}
        <span className="changes-pane__file-stats">
          <span className="changes-pane__status">{status}</span>
          {added > 0 ? <span className="changes-pane__add">+{added}</span> : null}
          {removed > 0 ? <span className="changes-pane__del">−{removed}</span> : null}
        </span>
        <button
          type="button"
          className="changes-pane__copy-btn"
          title={t("inspector.changes.copyPath")}
          aria-label={t("inspector.changes.copyPath")}
          onClick={() => void copyRelativePath(path)}
        >
          {MI.copy}
        </button>
        {onDispose ? (
          <span className="changes-pane__dispose">
            <button
              type="button"
              className="changes-pane__copy-btn"
              title={t("inspector.changes.revertFile")}
              aria-label={t("inspector.changes.revertFile")}
              disabled={disposeBusy}
              onClick={() => void onDispose("revert", path)}
            >
              <IconUndo />
            </button>
            <button
              type="button"
              className="changes-pane__copy-btn"
              title={t("inspector.changes.keepFile")}
              aria-label={t("inspector.changes.keepFile")}
              disabled={disposeBusy}
              onClick={() => void onDispose("keep", path)}
            >
              <IconCheck />
            </button>
          </span>
        ) : null}
      </div>
      {showDiff ? (
        <div ref={diffWrapRef} className="changes-pane__diff-wrap">
          {patch === null && !err ? (
            <div className="changes-diff__empty">{t("inspector.changes.loadingDiff")}</div>
          ) : err ? (
            <div className="changes-pane__error">{err}</div>
          ) : (
            <FileDiffBody
              path={path}
              patch={patch ?? ""}
              binary={binary}
              full={full}
              loadingFull={loadingFull}
              wordWrap={wordWrap}
              onExpandFull={() => void loadDiff(true)}
            />
          )}
        </div>
      ) : showSpacer ? (
        <div
          className="changes-pane__diff-wrap changes-pane__diff-wrap--spacer"
          style={{ height: spacerHeight }}
          aria-hidden
        />
      ) : null}
    </li>
  );
});

export function ChangesFileList({
  files,
  tree,
  workspaceId,
  selectedPath,
  onSelect,
  onOpenFile,
  onChanged,
  width,
  dragging,
  onResizePointerDown,
}: {
  files: GitChangedFile[];
  /** 全量工作区树；null 时回退为仅改动文件树。*/
  tree?: WorkspaceNode | null;
  /** 新建 / 重命名 / 删除等写操作的目标工作空间。 */
  workspaceId: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  /** 右键「在编辑器中打开」。*/
  onOpenFile: (path: string) => void;
  /** 写操作完成后刷新树与 git 状态。 */
  onChanged: () => void;
  width: number;
  dragging: boolean;
  onResizePointerDown: (e: ReactPointerEvent) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  // 侧栏是全量文件列表：改动文件带 +/- 统计，未改动文件原样可点开
  const treeNodes = useMemo(
    () => (tree ? buildFullTree(tree, files) : buildChangeTree(files)),
    [tree, files],
  );
  const { nodes, expandPaths } = useMemo(
    () => filterChangeTree(treeNodes, query),
    [treeNodes, query],
  );
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set());
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    path: string;
    kind: "file" | "dir";
  } | null>(null);
  /** 新建 / 重命名 / 删除等写操作由共享 hook 托管（Files 面板同用）。 */
  const actions = useFileTreeActions(workspaceId, onChanged);

  function openCtxMenu(e: ReactMouseEvent, path: string, kind: "file" | "dir") {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, path, kind });
  }

  useEffect(() => {
    if (!expandPaths.size) return;
    setOpenDirs((prev) => {
      const next = new Set(prev);
      for (const p of expandPaths) next.add(p);
      return next;
    });
  }, [expandPaths]);

  // 列表首次加载或清空搜索时，默认展开顶层目录。
  useEffect(() => {
    if (query.trim()) return;
    setOpenDirs((prev) => {
      if (prev.size) return prev;
      const next = new Set<string>();
      for (const n of treeNodes) {
        if (n.kind === "dir") next.add(n.path);
      }
      return next;
    });
  }, [treeNodes, query]);

  function toggleDir(path: string) {
    setOpenDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  // 目录开关、文件聚焦由各自 onActivate 决定；统计由 TreeView 渲染。
  function handleActivate(node: ChangeTreeNode) {
    if (node.kind === "dir") toggleDir(node.path);
    else onSelect(node.path);
  }

  const selectedPaths = useMemo(
    () => (selectedPath ? new Set([selectedPath]) : new Set<string>()),
    [selectedPath],
  );

  // TreeView 是 memo 的，传进去的回调必须引用稳定，否则父组件一重渲染整棵树就白 memo 了。
  const stableActivate = useStableCallback(handleActivate);
  const stableCtxMenu = useStableCallback(openCtxMenu);
  const stableMove = useStableCallback((source: string, dir: string) => {
    void actions.move(source, dir);
  });

  return (
    <aside className="changes-filelist" style={{ width }}>
      {/* biome-ignore lint/a11y/useSemanticElements: 文件列表拖宽手柄，ARIA separator + 指针拖拽模式，无对应原生控件 */}
      <div
        className={`filelist-splitter${dragging ? " is-dragging" : ""}`}
        onPointerDown={onResizePointerDown}
        title="Drag to resize"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={FILE_LIST_WIDTH.min}
        aria-valuemax={FILE_LIST_WIDTH.max}
        aria-label="Resize file list"
      />
      <div className="changes-filelist__search">
        <span className="changes-filelist__search-ico" aria-hidden>
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: 纯装饰性搜索图标，label 内 input 已有语义 */}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.55" />
            <path
              d="M10.4 10.4 13.6 13.6"
              stroke="currentColor"
              strokeWidth="1.55"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("inspector.changes.searchFiles")}
          aria-label={t("inspector.changes.searchFiles")}
        />
      </div>
      <div className="changes-filelist__tree">
        <TreeView
          nodes={nodes}
          openDirs={openDirs}
          showStats
          onActivate={stableActivate}
          onContextMenu={stableCtxMenu}
          onMove={stableMove}
          selectedPaths={selectedPaths}
        />
      </div>
      <ContextMenu
        open={Boolean(ctxMenu)}
        anchor={ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null}
        onClose={() => setCtxMenu(null)}
        aria-label={t("inspector.changes.fileMenu")}
        items={
          ctxMenu?.kind === "file"
            ? [
                {
                  label: t("inspector.changes.openFile"),
                  onSelect: () => {
                    const path = ctxMenu.path;
                    setCtxMenu(null);
                    onOpenFile(path);
                  },
                },
                {
                  label: t("inspector.files.revealInFolder"),
                  onSelect: () => {
                    const path = ctxMenu.path;
                    setCtxMenu(null);
                    void actions.reveal(path);
                  },
                },
                {
                  label: t("inspector.changes.copyPath"),
                  onSelect: () => {
                    const path = ctxMenu.path;
                    setCtxMenu(null);
                    void copyRelativePath(path);
                  },
                },
                {
                  label: t("inspector.files.rename"),
                  separatorBefore: true,
                  onSelect: () => {
                    const path = ctxMenu.path;
                    setCtxMenu(null);
                    actions.startRename(path);
                  },
                },
                {
                  label: t("inspector.files.trash"),
                  onSelect: () => {
                    const path = ctxMenu.path;
                    setCtxMenu(null);
                    actions.setPendingRemove(path);
                  },
                },
              ]
            : ctxMenu
              ? [
                  {
                    label: t("inspector.files.newFile"),
                    onSelect: () => {
                      const path = ctxMenu.path;
                      setCtxMenu(null);
                      actions.startNewFile(path);
                    },
                  },
                  {
                    label: t("inspector.files.newFolder"),
                    onSelect: () => {
                      const path = ctxMenu.path;
                      setCtxMenu(null);
                      actions.startNewFolder(path);
                    },
                  },
                  {
                    label: t("inspector.files.revealInFolder"),
                    separatorBefore: true,
                    onSelect: () => {
                      const path = ctxMenu.path;
                      setCtxMenu(null);
                      void actions.reveal(path);
                    },
                  },
                  {
                    label: t("inspector.changes.copyPath"),
                    onSelect: () => {
                      const path = ctxMenu.path;
                      setCtxMenu(null);
                      void copyRelativePath(path);
                    },
                  },
                  // 工作空间根不允许改名 / 删除，否则会作用到整个仓库。
                  ...(ctxMenu.path === "."
                    ? []
                    : [
                        {
                          label: t("inspector.files.rename"),
                          separatorBefore: true,
                          onSelect: () => {
                            const path = ctxMenu.path;
                            setCtxMenu(null);
                            actions.startRename(path);
                          },
                        },
                        {
                          label: t("inspector.files.trash"),
                          onSelect: () => {
                            const path = ctxMenu.path;
                            setCtxMenu(null);
                            actions.setPendingRemove(path);
                          },
                        },
                      ]),
                ]
              : []
        }
      />

      <FileTreeActionModals actions={actions} />
    </aside>
  );
}
