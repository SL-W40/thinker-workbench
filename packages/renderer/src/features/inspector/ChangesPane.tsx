/**
 * Changes 面板：Git 状态、懒加载 diff、侧栏文件列表与 CTA prompt。
 * 交互与 className 对齐 v1 ChangesPane。
 */
import type { GitChangedFile, GitStatus } from "@thinker-workbench/shared";
import { ContextMenu, EmptyState } from "@thinker-workbench/design/react";
import { highlightCode } from "@thinker-workbench/markdown";
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  memo,
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  FILE_LIST_AUTO_PANE_MIN,
  FILE_LIST_WIDTH,
  useFileListOpen,
  useFileListWidth,
} from "./useFileListPanel";
import { workspaceGitFileDiff } from "../../bridge/workspaceFs";
import { useT } from "../../i18n/I18nProvider";
import {
  buildChangeTree,
  filterChangeTree,
  type ChangeTreeNode,
} from "./changesTree";
import { FileGlyph, IconChevron, IconPanelHide, MI } from "./icons";
import { loadInspectorUi, patchInspectorUi } from "./inspectorUi";

const MENU_GAP = 6;
const MENU_VIEW_PAD = 8;

type FloatingMenuCoords = {
  top: number;
  left: number;
  minWidth: number;
};

/** 右对齐触发器，必要时夹入视口，避免被侧栏 overflow 裁切（配合 portal）。 */
function placeFloatingMenu(
  trigger: DOMRect,
  minWidth: number,
): FloatingMenuCoords {
  const vw = window.innerWidth;
  const width = Math.max(minWidth, trigger.width);
  let left = trigger.right - width;
  if (left < MENU_VIEW_PAD) left = MENU_VIEW_PAD;
  if (left + width > vw - MENU_VIEW_PAD) {
    left = Math.max(MENU_VIEW_PAD, vw - width - MENU_VIEW_PAD);
  }
  return {
    top: trigger.bottom + MENU_GAP,
    left,
    minWidth: width,
  };
}

/** 将菜单挂到 body，并随触发器 / 滚动 / 窗口变化重算位置。 */
function useFloatingMenuCoords(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  minWidth: number,
): FloatingMenuCoords | null {
  const [coords, setCoords] = useState<FloatingMenuCoords | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      setCoords(placeFloatingMenu(el.getBoundingClientRect(), minWidth));
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, triggerRef, minWidth]);

  return coords;
}

function PortalMenu({
  open,
  coords,
  menuRef,
  className,
  children,
}: {
  open: boolean;
  coords: FloatingMenuCoords | null;
  menuRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
}) {
  if (!open || !coords || typeof document === "undefined") return null;
  const style: CSSProperties = {
    top: coords.top,
    left: coords.left,
    minWidth: coords.minWidth,
  };
  return createPortal(
    <div
      ref={menuRef}
      className={`changes-pane__menu changes-pane__menu--portal${className ? ` ${className}` : ""}`}
      role="menu"
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
}

/** 限制并行 git diff 请求，避免「全部展开」打爆 runtime。 */
const DIFF_FETCH_LIMIT = 3;
let diffFetchesActive = 0;
const diffFetchWaiters: Array<() => void> = [];

function acquireDiffFetch(): Promise<void> {
  if (diffFetchesActive < DIFF_FETCH_LIMIT) {
    diffFetchesActive += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    diffFetchWaiters.push(() => {
      diffFetchesActive += 1;
      resolve();
    });
  });
}

function releaseDiffFetch() {
  diffFetchesActive = Math.max(0, diffFetchesActive - 1);
  const next = diffFetchWaiters.shift();
  if (next) next();
}

async function copyRelativePath(path: string) {
  try {
    await navigator.clipboard.writeText(path);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = path;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export type ChangesPromptActionId =
  | "createBranchAndCommit"
  | "createBranchCommitAndPush"
  | "createBranch"
  | "commitAndPush"
  | "commit"
  | "commitAndCreatePr";

export const CHANGES_ACTION_PROMPTS: Record<ChangesPromptActionId, string> = {
  createBranchAndCommit:
    "Create a new branch and commit the current changes with an appropriate message.",
  createBranchCommitAndPush:
    "Create a new branch, commit the current changes, and push to the remote.",
  createBranch: "Create a new branch for the current uncommitted changes.",
  commitAndPush:
    "Commit the current changes with an appropriate message and push to the remote.",
  commit: "Commit the current changes with an appropriate message.",
  commitAndCreatePr: "Commit the current changes and open a pull request.",
};

type Props = {
  workspaceId?: string | null;
  status: GitStatus | null;
  loading?: boolean;
  error?: string | null;
  onRefresh: () => void;
  onInitRepo: () => void | Promise<void>;
  onOpenFile: (path: string) => void;
  onSendAction: (action: ChangesPromptActionId) => void;
};

const CTA_MENU_ACTIONS: ChangesPromptActionId[] = [
  "createBranchCommitAndPush",
  "createBranch",
  "commitAndPush",
  "commit",
  "commitAndCreatePr",
];

type DiffRow =
  | { kind: "meta"; text: string }
  | { kind: "hunk"; text: string }
  | { kind: "add" | "del" | "ctx"; text: string; oldNo: number | null; newNo: number | null }
  | { kind: "gap"; id: string; count: number };

function parseUnifiedDiff(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNo = 0;
  let newNo = 0;
  let prevNewEnd = 0;
  let gapIndex = 0;

  for (const raw of patch.split(/\r?\n/)) {
    if (
      raw.startsWith("diff --git") ||
      raw.startsWith("index ") ||
      raw.startsWith("--- ") ||
      raw.startsWith("+++ ") ||
      raw.startsWith("new file") ||
      raw.startsWith("deleted file") ||
      raw.startsWith("old mode") ||
      raw.startsWith("new mode") ||
      raw.startsWith("similarity index") ||
      raw.startsWith("rename from") ||
      raw.startsWith("rename to")
    ) {
      continue;
    }

    const hunk = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(raw);
    if (hunk) {
      const nextOld = Number.parseInt(hunk[1], 10) || 0;
      const nextNew = Number.parseInt(hunk[3], 10) || 0;
      if (prevNewEnd > 0 && nextNew > prevNewEnd + 1) {
        const count = nextNew - prevNewEnd - 1;
        if (count > 0) {
          rows.push({ kind: "gap", id: `gap-${gapIndex++}`, count });
        }
      }
      oldNo = nextOld;
      newNo = nextNew;
      rows.push({ kind: "hunk", text: raw });
      continue;
    }

    if (raw.startsWith("+")) {
      rows.push({ kind: "add", text: raw.slice(1), oldNo: null, newNo });
      newNo += 1;
      prevNewEnd = newNo - 1;
      continue;
    }
    if (raw.startsWith("-")) {
      rows.push({ kind: "del", text: raw.slice(1), oldNo, newNo: null });
      oldNo += 1;
      continue;
    }
    if (raw.startsWith(" ") || raw === "") {
      const text = raw.startsWith(" ") ? raw.slice(1) : "";
      rows.push({ kind: "ctx", text, oldNo, newNo });
      oldNo += 1;
      newNo += 1;
      prevNewEnd = newNo - 1;
      continue;
    }
    if (raw.startsWith("\\")) {
      rows.push({ kind: "meta", text: raw });
    }
  }
  return rows;
}

/** 扩展名 → highlight.js 语言 id（与聊天 FileDiffView 对齐）。 */
function langFromPath(path: string): string | undefined {
  const base = path.split(/[/\\]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return undefined;
  const ext = base.slice(dot + 1).toLowerCase();
  const map: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    md: "markdown",
    markdown: "markdown",
    py: "python",
    css: "css",
    less: "css",
    html: "html",
    htm: "html",
    xml: "xml",
    svg: "xml",
    yml: "yaml",
    yaml: "yaml",
    sh: "bash",
    bash: "bash",
  };
  return map[ext] ?? ext;
}

const FileDiffBody = memo(function FileDiffBody({
  path,
  patch,
  binary,
  full,
  onExpandFull,
  loadingFull,
  wordWrap,
}: {
  path: string;
  patch: string;
  binary: boolean;
  full: boolean;
  onExpandFull: () => void;
  loadingFull: boolean;
  wordWrap: boolean;
}) {
  const t = useT();
  const rows = useMemo(() => parseUnifiedDiff(patch), [patch]);
  const lang = useMemo(() => langFromPath(path), [path]);
  const highlighted = useMemo(() => {
    return rows.map((row) => {
      if (row.kind === "gap" || row.kind === "hunk" || row.kind === "meta") return "";
      if (!row.text) return "";
      return highlightCode(row.text, lang).html;
    });
  }, [rows, lang]);

  if (binary) {
    return <div className="changes-diff__empty">{t("inspector.changes.binaryDiff")}</div>;
  }
  if (!patch.trim()) {
    return <div className="changes-diff__empty">{t("inspector.changes.emptyDiff")}</div>;
  }

  return (
    <div className={`changes-diff${wordWrap ? " is-wrap" : ""}`}>
      <div className="changes-diff__body">
        {rows.map((row, i) => {
          if (row.kind === "gap") {
            if (full) return null;
            return (
              <button
                key={row.id}
                type="button"
                className="changes-diff__gap"
                onClick={onExpandFull}
                disabled={loadingFull}
              >
                <span className="changes-diff__gap-ctrl" aria-hidden>
                  <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
                    <path
                      d="M2.2 5.2 5 2.4l2.8 2.8M2.2 8.8 5 11.6l2.8-2.8"
                      stroke="currentColor"
                      strokeWidth="1.35"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="changes-diff__gap-label">
                  {loadingFull
                    ? t("inspector.changes.expanding")
                    : t("inspector.changes.unmodifiedLines", { n: String(row.count) })}
                </span>
              </button>
            );
          }
          if (row.kind === "hunk" || row.kind === "meta") return null;
          const lineNo = row.kind === "del" ? row.oldNo : row.newNo;
          return (
            <div
              key={`l-${i}`}
              className={`changes-diff__line changes-diff__line--${row.kind}`}
            >
              <span className="changes-diff__gutter">{lineNo ?? ""}</span>
              <span className="changes-diff__mark" aria-hidden>
                {row.kind === "add" ? "+" : row.kind === "del" ? "−" : " "}
              </span>
              <code
                className="changes-diff__text hljs"
                dangerouslySetInnerHTML={{ __html: highlighted[i] || " " }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

function ChangedFileRow({
  workspaceId,
  path,
  added,
  removed,
  status,
  onOpenFile,
  expandToken,
  expandAllToken,
  collapseToken,
  wordWrap,
}: {
  workspaceId: string;
  path: string;
  added: number;
  removed: number;
  status: string;
  onOpenFile: (path: string) => void;
  /** 侧栏点开文件时递增，驱动本行展开。 */
  expandToken?: number;
  /** 工具栏「全部展开」时递增。 */
  expandAllToken?: number;
  /** 工具栏「全部折叠」时递增。 */
  collapseToken?: number;
  wordWrap: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [patch, setPatch] = useState<string | null>(null);
  const [binary, setBinary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = useT();
  const rowRef = useRef<HTMLLIElement>(null);
  const patchRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  patchRef.current = patch;

  async function loadDiff(nextFull: boolean) {
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
  }

  function toggle() {
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (expandToken == null || expandToken <= 0) return;
    setOpen(true);
    rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [expandToken]);

  useEffect(() => {
    if (expandAllToken == null || expandAllToken <= 0) return;
    setOpen(true);
  }, [expandAllToken]);

  useEffect(() => {
    if (collapseToken == null || collapseToken <= 0) return;
    setOpen(false);
  }, [collapseToken]);

  // 仅在展开行进入视口附近时拉取 diff（全部展开时更轻）。
  useEffect(() => {
    if (!open || patch !== null) return;
    const el = rowRef.current;
    if (!el) return;
    const root = el.closest(".changes-pane__list");
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (cancelled || !entries.some((e) => e.isIntersecting)) return;
        if (patchRef.current !== null || loadingRef.current) return;
        io.disconnect();
        void loadDiff(false);
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: "280px 0px",
        threshold: 0,
      },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [open, patch, workspaceId, path]);

  return (
    <li ref={rowRef} className={`changes-pane__item${open ? " is-open" : ""}`} data-path={path}>
      <div className="changes-pane__file-row">
        <button
          type="button"
          className="changes-pane__toggle"
          onClick={() => void toggle()}
          title={open ? t("inspector.changes.collapseDiff") : t("inspector.changes.expandDiff")}
          aria-expanded={open}
          aria-label={open ? t("inspector.changes.collapseDiff") : t("inspector.changes.expandDiff")}
        >
          <span className="changes-pane__lead" aria-hidden>
            <span className="changes-pane__file-ico">
              <FileGlyph name={path.split("/").pop() || path} />
            </span>
            <span className="changes-pane__chev">
              <IconChevron open={open} />
            </span>
          </span>
        </button>
        <button
          type="button"
          className="changes-pane__file-name"
          onClick={() => onOpenFile(path)}
        >
          {path}
        </button>
        <span className="changes-pane__file-stats">
          {added > 0 ? <span className="changes-pane__add">+{added}</span> : null}
          {removed > 0 ? <span className="changes-pane__del">−{removed}</span> : null}
          {!added && !removed ? <span className="changes-pane__status">{status}</span> : null}
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
      </div>
      {open && (loading || patch !== null || err) ? (
        <div className="changes-pane__diff-wrap">
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
      ) : null}
    </li>
  );
}

function ChangesFileList({
  files,
  selectedPath,
  onSelect,
  onOpenFile,
  width,
  dragging,
  onResizePointerDown,
}: {
  files: GitChangedFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  /** 右键「在编辑器中打开」。 */
  onOpenFile: (path: string) => void;
  width: number;
  dragging: boolean;
  onResizePointerDown: (e: ReactPointerEvent) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const tree = useMemo(() => buildChangeTree(files), [files]);
  const { nodes, expandPaths } = useMemo(() => filterChangeTree(tree, query), [tree, query]);
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set());
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    path: string;
    kind: "file" | "dir";
  } | null>(null);

  function openCtxMenu(
    e: ReactMouseEvent,
    path: string,
    kind: "file" | "dir",
  ) {
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
      for (const n of tree) {
        if (n.kind === "dir") next.add(n.path);
      }
      return next;
    });
  }, [tree, query]);

  function toggleDir(path: string) {
    setOpenDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNodes(list: ChangeTreeNode[], depth: number) {
    return list.map((node) => {
      if (node.kind === "dir") {
        const open = openDirs.has(node.path) || Boolean(query.trim() && expandPaths.has(node.path));
        return (
          <div key={`d:${node.path}`} className="changes-filelist__dir">
            <button
              type="button"
              className="changes-filelist__dir-row"
              style={{ paddingLeft: 6 + depth * 12 }}
              onClick={() => toggleDir(node.path)}
              onContextMenu={(e) => openCtxMenu(e, node.path, "dir")}
              aria-expanded={open}
            >
              <span className="changes-filelist__chev" aria-hidden>
                <IconChevron open={open} />
              </span>
              <span className="changes-filelist__dir-name">{node.name}</span>
            </button>
            {open ? renderNodes(node.children, depth + 1) : null}
          </div>
        );
      }
      const selected = node.path === selectedPath;
      return (
        <button
          key={node.path}
          type="button"
          className={`changes-filelist__file${selected ? " is-selected" : ""}`}
          style={{ paddingLeft: 6 + depth * 12 }}
          onClick={() => onSelect(node.path)}
          onContextMenu={(e) => openCtxMenu(e, node.path, "file")}
        >
          <span className="changes-filelist__file-ico" aria-hidden>
            <FileGlyph name={node.name} />
          </span>
          <span className="changes-filelist__file-name">{node.name}</span>
          <span className="changes-filelist__stats">
            {node.added > 0 ? <span className="changes-pane__add">+{node.added}</span> : null}
            {node.removed > 0 ? <span className="changes-pane__del">−{node.removed}</span> : null}
          </span>
        </button>
      );
    });
  }

  return (
    <aside className="changes-filelist" style={{ width }}>
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
      <label className="changes-filelist__search">
        <span className="changes-filelist__search-ico" aria-hidden>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.55" />
            <path d="M10.4 10.4 13.6 13.6" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("inspector.changes.searchFiles")}
          aria-label={t("inspector.changes.searchFiles")}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="changes-filelist__tree">{renderNodes(nodes, 0)}</div>
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
                  label: t("inspector.changes.copyPath"),
                  onSelect: () => {
                    const path = ctxMenu.path;
                    setCtxMenu(null);
                    void copyRelativePath(path);
                  },
                },
              ]
            : ctxMenu
              ? [
                  {
                    label: t("inspector.changes.copyPath"),
                    onSelect: () => {
                      const path = ctxMenu.path;
                      setCtxMenu(null);
                      void copyRelativePath(path);
                    },
                  },
                ]
              : []
        }
      />
    </aside>
  );
}

/** 冲突优先，其次按改动量（+/-）降序，再按路径。 */
function sortChangedFiles(list: GitChangedFile[]): GitChangedFile[] {
  return [...list].sort((a, b) => {
    const rank = (s: string) => (s === "conflict" ? 0 : 1);
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    const churn = (f: GitChangedFile) => f.added + f.removed;
    const byChurn = churn(b) - churn(a);
    if (byChurn !== 0) return byChurn;
    return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" });
  });
}

export function ChangesPane({
  workspaceId,
  status,
  loading,
  error,
  onRefresh,
  onInitRepo,
  onOpenFile,
  onSendAction,
}: Props) {
  const t = useT();
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [ctaMenuOpen, setCtaMenuOpen] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [expandTick, setExpandTick] = useState(0);
  const [expandAllTick, setExpandAllTick] = useState(0);
  const [collapseTick, setCollapseTick] = useState(0);
  const viewWrapRef = useRef<HTMLDivElement>(null);
  const ctaSplitRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const ctaMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuCoords = useFloatingMenuCoords(viewMenuOpen, viewWrapRef, 200);
  const ctaMenuCoords = useFloatingMenuCoords(ctaMenuOpen, ctaSplitRef, 240);

  const restoredUi = useMemo(
    () => loadInspectorUi(workspaceId ?? null),
    [workspaceId],
  );
  const skipPersist = useRef(true);
  const { open: listOpen, forced: listForced, toggle: toggleList, paneRef } = useFileListOpen(
    FILE_LIST_AUTO_PANE_MIN,
    workspaceId ?? "",
    restoredUi.changesListForced,
  );
  const { width: listWidth, dragging: listDragging, onResizePointerDown } = useFileListWidth(
    restoredUi.changesListWidth,
    workspaceId ?? "",
  );

  useEffect(() => {
    skipPersist.current = true;
    const id = window.setTimeout(() => {
      skipPersist.current = false;
    }, 0);
    return () => window.clearTimeout(id);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || skipPersist.current) return;
    patchInspectorUi(workspaceId, {
      changesListForced: listForced,
      changesListWidth: listWidth,
    });
  }, [workspaceId, listForced, listWidth]);

  const files = useMemo(() => sortChangedFiles(status?.files ?? []), [status?.files]);
  const noChanges = !status?.isRepo || files.length === 0;
  const totals = status?.totals ?? { added: 0, removed: 0 };

  function focusFromSidebar(path: string) {
    setFocusPath(path);
    setExpandTick((n) => n + 1);
  }

  function sendAction(id: ChangesPromptActionId) {
    setCtaMenuOpen(false);
    setViewMenuOpen(false);
    onSendAction(id);
  }

  useEffect(() => {
    if (!viewMenuOpen && !ctaMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        viewWrapRef.current?.contains(target) ||
        ctaSplitRef.current?.contains(target) ||
        viewMenuRef.current?.contains(target) ||
        ctaMenuRef.current?.contains(target)
      ) {
        return;
      }
      setViewMenuOpen(false);
      setCtaMenuOpen(false);
    };
    // capture：避免中间层 stopPropagation 导致关不掉
    window.addEventListener("mousedown", onPointer, true);
    return () => window.removeEventListener("mousedown", onPointer, true);
  }, [viewMenuOpen, ctaMenuOpen]);

  // 聊天页 keep-alive（hidden）时 portal 菜单仍挂在 body，切页时主动关掉
  useEffect(() => {
    if (!viewMenuOpen && !ctaMenuOpen) return;
    const triggers = [viewWrapRef.current, ctaSplitRef.current].filter(
      (el): el is HTMLDivElement => el != null,
    );
    if (triggers.length === 0) return;

    const close = () => {
      setViewMenuOpen(false);
      setCtaMenuOpen(false);
    };
    const closeIfHidden = () => {
      if (triggers.some((el) => !el.isConnected || el.closest("[hidden]"))) close();
    };

    const mo = new MutationObserver(closeIfHidden);
    for (const trigger of triggers) {
      let node: Element | null = trigger;
      while (node) {
        mo.observe(node, { attributes: true, attributeFilter: ["hidden"] });
        node = node.parentElement;
      }
    }
    window.addEventListener("hashchange", close);
    closeIfHidden();

    return () => {
      mo.disconnect();
      window.removeEventListener("hashchange", close);
    };
  }, [viewMenuOpen, ctaMenuOpen]);

  if (!status && loading) {
    return (
      <div className="changes-pane changes-pane--empty">
        <EmptyState
          title={t("inspector.section.changes")}
          description={t("inspector.changes.loading")}
        />
      </div>
    );
  }

  if (!status && error) {
    return (
      <div className="changes-pane changes-pane--empty">
        <EmptyState
          title={t("inspector.changes.errorTitle")}
          description={error}
          action={
            <button type="button" className="changes-pane__primary" onClick={() => void onRefresh()}>
              {t("inspector.refresh")}
            </button>
          }
        />
      </div>
    );
  }

  if (status && status.gitAvailable === false) {
    return (
      <div className="changes-pane changes-pane--empty">
        <EmptyState
          title={t("inspector.changes.gitMissingTitle")}
          description={t("inspector.changes.gitMissingBody")}
          action={
            <button type="button" className="changes-pane__primary" onClick={() => void onRefresh()}>
              {t("inspector.refresh")}
            </button>
          }
        />
        {error ? <div className="changes-pane__error">{error}</div> : null}
      </div>
    );
  }

  if (status && !status.isRepo) {
    return (
      <div className="changes-pane changes-pane--empty">
        <EmptyState
          title={t("inspector.changes.notRepoTitle")}
          description={t("inspector.changes.notRepoBody")}
          action={
            <button
              type="button"
              className="changes-pane__primary"
              onClick={() => void onInitRepo()}
            >
              {t("inspector.changes.initRepo")}
            </button>
          }
        />
        {error ? <div className="changes-pane__error">{error}</div> : null}
      </div>
    );
  }

  return (
    <div
      ref={paneRef}
      className={`changes-pane${listOpen && !noChanges ? " has-filelist" : ""}`}
    >
      <div className="changes-pane__head">
        <div className="changes-pane__toolbar">
          <div className="changes-pane__meta">
            <span className="changes-pane__stack-ico" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3.2 5.2h9.6v7.2H3.2zM4.6 3.6h9.6v1.2M6 2h7.2v1.2"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.2 8.2h1.8M7.1 7.3v1.8M9.4 9.4h1.6"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="changes-pane__section">{t("inspector.changes.uncommitted")}</span>
            {(totals.added > 0 || totals.removed > 0) && (
              <span className="changes-pane__totals">
                <span className="changes-pane__add">+{totals.added}</span>
                <span className="changes-pane__del">−{totals.removed}</span>
              </span>
            )}
            <span className="changes-pane__branch" title={status?.branch ?? ""}>
              {status?.branch ?? "HEAD"}
            </span>
          </div>
          <div className="changes-pane__actions">
            <div className="changes-pane__view-wrap" ref={viewWrapRef}>
              <button
                type="button"
                className="changes-pane__icon-btn changes-pane__icon-btn--more"
                aria-label={t("inspector.changes.viewOptions")}
                title={t("inspector.changes.viewOptions")}
                aria-expanded={viewMenuOpen}
                onClick={() => {
                  setCtaMenuOpen(false);
                  setViewMenuOpen((v) => !v);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <circle cx="3.5" cy="8" r="1.15" fill="currentColor" />
                  <circle cx="8" cy="8" r="1.15" fill="currentColor" />
                  <circle cx="12.5" cy="8" r="1.15" fill="currentColor" />
                </svg>
              </button>
              <PortalMenu open={viewMenuOpen} coords={viewMenuCoords} menuRef={viewMenuRef}>
                <button
                  type="button"
                  className="changes-pane__menu-item changes-pane__menu-item--toggle"
                  role="menuitemcheckbox"
                  aria-checked={wordWrap}
                  onClick={() => setWordWrap((v) => !v)}
                >
                  <span>{t("inspector.changes.wordWrap")}</span>
                  <span
                    className={`changes-pane__switch${wordWrap ? " is-on" : ""}`}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  className="changes-pane__menu-item"
                  role="menuitem"
                  disabled={noChanges}
                  onClick={() => {
                    setViewMenuOpen(false);
                    startTransition(() => setExpandAllTick((n) => n + 1));
                  }}
                >
                  {t("inspector.changes.expandAll")}
                </button>
                <button
                  type="button"
                  className="changes-pane__menu-item"
                  role="menuitem"
                  disabled={noChanges}
                  onClick={() => {
                    setCollapseTick((n) => n + 1);
                    setViewMenuOpen(false);
                  }}
                >
                  {t("inspector.changes.collapseAll")}
                </button>
              </PortalMenu>
            </div>

            <div className="changes-pane__cta-split" ref={ctaSplitRef}>
              <button
                type="button"
                className="changes-pane__cta"
                disabled={noChanges}
                onClick={() => sendAction("createBranchAndCommit")}
              >
                {t("inspector.changes.cta.createBranchAndCommit")}
              </button>
              <button
                type="button"
                className="changes-pane__cta-chev-btn"
                disabled={noChanges}
                aria-label={t("inspector.changes.moreActions")}
                aria-expanded={ctaMenuOpen}
                title={t("inspector.changes.moreActions")}
                onClick={() => {
                  setViewMenuOpen(false);
                  setCtaMenuOpen((v) => !v);
                }}
              >
                <IconChevron open />
              </button>
              <PortalMenu
                open={ctaMenuOpen}
                coords={ctaMenuCoords}
                menuRef={ctaMenuRef}
                className="changes-pane__menu--cta"
              >
                {CTA_MENU_ACTIONS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="changes-pane__menu-item"
                    role="menuitem"
                    disabled={noChanges}
                    onClick={() => sendAction(id)}
                  >
                    {t(`inspector.changes.cta.${id}` as "inspector.changes.cta.commit")}
                  </button>
                ))}
              </PortalMenu>
            </div>

            <button
              type="button"
              className="changes-pane__icon-btn"
              title={t("inspector.refresh")}
              onClick={onRefresh}
            >
              {MI.refresh}
            </button>
            <button
              type="button"
              className={`changes-pane__icon-btn${listOpen ? " is-on" : ""}`}
              title={listOpen ? t("inspector.files.hideList") : t("inspector.files.showList")}
              aria-label={listOpen ? t("inspector.files.hideList") : t("inspector.files.showList")}
              aria-pressed={listOpen}
              disabled={noChanges}
              onClick={toggleList}
            >
              <IconPanelHide />
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="changes-pane__error">{error}</div> : null}

      {noChanges ? (
        <div className="changes-pane__empty-body">
          <EmptyState
            title={t("inspector.changes.cleanTitle")}
            description={t("inspector.changes.cleanBody")}
          />
        </div>
      ) : (
        <div className="changes-pane__body">
          <div className="changes-pane__main">
            <ul className="changes-pane__list">
              {files.map((f) =>
                workspaceId ? (
                  <ChangedFileRow
                    key={f.path}
                    workspaceId={workspaceId}
                    path={f.path}
                    added={f.added}
                    removed={f.removed}
                    status={f.status}
                    onOpenFile={onOpenFile}
                    expandToken={focusPath === f.path ? expandTick : 0}
                    expandAllToken={expandAllTick}
                    collapseToken={collapseTick}
                    wordWrap={wordWrap}
                  />
                ) : (
                  <li key={f.path} className="changes-pane__item">
                    <div className="changes-pane__file-row">
                      <button
                        type="button"
                        className="changes-pane__file-name"
                        onClick={() => onOpenFile(f.path)}
                      >
                        {f.path}
                      </button>
                      <span className="changes-pane__file-stats">
                        {f.added > 0 ? <span className="changes-pane__add">+{f.added}</span> : null}
                        {f.removed > 0 ? (
                          <span className="changes-pane__del">−{f.removed}</span>
                        ) : null}
                      </span>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </div>
          {listOpen ? (
            <ChangesFileList
              files={files}
              selectedPath={focusPath}
              onSelect={focusFromSidebar}
              onOpenFile={onOpenFile}
              width={listWidth}
              dragging={listDragging}
              onResizePointerDown={onResizePointerDown}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
