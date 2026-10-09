/**
 * 右侧 agent inspector（对齐 v1 WorkspacePane agent 分支）：
 * 起始磁贴 → Tab 条（Changes / Files / file:*）→ 对应壳层。
 * 数据走 desktop IPC（workspaceFs），CTA 经 onSendPrompt 注入聊天。
 */
import type { GitStatus, WorkspaceNode } from "@thinker-workbench/shared";
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
} from "@thinker-workbench/design/react";
import {
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  workspaceGitInit,
  workspaceGitStatus,
  workspaceReadFile,
  workspaceTree,
  workspaceWriteFile,
} from "../../bridge/workspaceFs";
import { useT } from "../../i18n/I18nProvider";
import {
  CHANGES_ACTION_PROMPTS,
  ChangesPane,
  type ChangesPromptActionId,
} from "./ChangesPane";
import { FileEditor } from "./FileEditor";
import { FileTree } from "./FileTree";
import { FilesHome } from "./FilesHome";
import { MediaPreview, type MediaPreviewInfo } from "./MediaPreview";
import { loadFileRecents, pushFileRecent } from "./fileRecents";
import { FileStartIcon, GitIcon, IconPanelHide } from "./icons";
import {
  hydrateTabs,
  loadInspectorUi,
  patchInspectorUi,
  resolveActiveKey,
  serializeTabs,
} from "./inspectorUi";
import {
  applyTreeSelection,
  filterWorkspaceTree,
  selectionJoinFlags,
  visibleTreePaths,
  type TreeSelectGesture,
} from "./treeSelection";
import {
  CHANGES_TAB_KEY,
  FILES_TAB_KEY,
  type StageTab,
} from "./types";
import {
  FILE_LIST_AUTO_PANE_MIN,
  FILE_LIST_WIDTH,
  useFileListOpen,
  useFileListWidth,
} from "./useFileListPanel";
import "./inspector.less";

type Props = {
  workspaceId: string | null;
  /** Changes CTA：把固定英文 prompt 发给当前会话。 */
  onSendPrompt?: (prompt: string) => void;
  /** 外部请求打开的工作空间相对路径（如聊天 diff 点文件名）；消费后回调清空。 */
  pendingOpenPath?: string | null;
  onPendingOpenPathConsumed?: () => void;
};

/** 从树收集全部文件相对路径（供 FilesHome 搜索）。 */
function collectFilePaths(node: WorkspaceNode | null): string[] {
  if (!node) return [];
  if (node.type === "file") return [node.path === "." ? "" : node.path].filter(Boolean);
  return (node.children ?? []).flatMap(collectFilePaths);
}

function fileTabKey(path: string): string {
  return `file:${path}`;
}

function baseName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

function langBadge(path: string): string {
  if (!path) return "NEW";
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "tsx") return "TSX";
  if (ext === "ts") return "TS";
  if (ext === "jsx") return "JSX";
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "JS";
  if (ext === "json") return "{}";
  if (ext === "md") return "MD";
  if (ext === "css" || ext === "less") return "CSS";
  return (ext || "FILE").slice(0, 4).toUpperCase();
}

/** 规范化工作空间相对路径。 */
function normalizeRelPath(raw: string): string {
  return raw.trim().replace(/\\/g, "/").replace(/^\//, "");
}

function isDraftTabKey(key: string): boolean {
  return key.startsWith("draft:");
}

/** 恢复会话时按路径读入缓冲，不切换 activeTab。 */
async function loadFileBuffers(
  workspaceId: string,
  path: string,
  setters: {
    setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
    setSaved: Dispatch<SetStateAction<Record<string, string>>>;
    setUnsaved: Dispatch<SetStateAction<Record<string, boolean>>>;
    setMediaByKey: Dispatch<SetStateAction<Record<string, MediaPreviewInfo>>>;
    setReadOnlyByPath: Dispatch<SetStateAction<Record<string, boolean>>>;
  },
): Promise<void> {
  const key = fileTabKey(path);
  const {
    setDrafts,
    setSaved,
    setUnsaved,
    setMediaByKey,
    setReadOnlyByPath,
  } = setters;
  try {
    const file = await workspaceReadFile(workspaceId, path);
    if (file.mediaKind) {
      setMediaByKey((d) => ({
        ...d,
        [key]: {
          kind: file.mediaKind!,
          mimeType: file.mimeType,
          previewDataUrl: file.previewDataUrl,
          size: file.size,
        },
      }));
      setDrafts((d) => ({ ...d, [key]: "" }));
      setSaved((d) => ({ ...d, [key]: "" }));
      setReadOnlyByPath((d) => ({ ...d, [path]: true }));
      setUnsaved((d) => ({ ...d, [key]: false }));
    } else if (file.binary || !file.editable) {
      setMediaByKey((d) => ({
        ...d,
        [key]: { kind: "binary", size: file.size, mimeType: file.mimeType },
      }));
      setDrafts((d) => ({ ...d, [key]: "" }));
      setSaved((d) => ({ ...d, [key]: "" }));
      setReadOnlyByPath((d) => ({ ...d, [path]: true }));
      setUnsaved((d) => ({ ...d, [key]: false }));
    } else {
      setMediaByKey((d) => {
        const n = { ...d };
        delete n[key];
        return n;
      });
      setDrafts((d) => ({ ...d, [key]: file.content }));
      setSaved((d) => ({ ...d, [key]: file.content }));
      setReadOnlyByPath((d) => ({ ...d, [path]: false }));
      setUnsaved((d) => ({ ...d, [key]: false }));
    }
  } catch {
    setDrafts((d) => ({ ...d, [key]: "" }));
    setSaved((d) => ({ ...d, [key]: "" }));
  }
}

export function RightInspector({
  workspaceId,
  onSendPrompt,
  pendingOpenPath,
  onPendingOpenPathConsumed,
}: Props) {
  const t = useT();
  const tabsRef = useRef<HTMLDivElement>(null);
  const draftSeq = useRef(0);
  /** 跳过恢复后的首次写回，避免用空态覆盖 localStorage。 */
  const skipPersist = useRef(true);

  const restoredUi = useMemo(() => loadInspectorUi(workspaceId), [workspaceId]);

  const [tabs, setTabs] = useState<StageTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  /** 未命名缓冲首次保存：填写相对路径。 */
  const [saveAs, setSaveAs] = useState<{ key: string; draft: string } | null>(null);

  const [tree, setTree] = useState<WorkspaceNode | null>(null);
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set());
  const [treeQuery, setTreeQuery] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [unsaved, setUnsaved] = useState<Record<string, boolean>>({});
  const [readOnlyByPath, setReadOnlyByPath] = useState<Record<string, boolean>>({});
  /** 媒体 / 二进制预览缓存（按 file: tab key）。 */
  const [mediaByKey, setMediaByKey] = useState<Record<string, MediaPreviewInfo>>({});

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);

  const {
    open: filesListOpen,
    forced: filesListForced,
    toggle: toggleFilesList,
    setOpen: setFilesListOpen,
    paneRef: filesPaneRef,
  } = useFileListOpen(
    FILE_LIST_AUTO_PANE_MIN,
    workspaceId ?? "",
    restoredUi.filesListForced,
  );
  const {
    width: filesListWidth,
    dragging: filesListDragging,
    onResizePointerDown: onFilesListResize,
  } = useFileListWidth(restoredUi.filesListWidth, workspaceId ?? "");

  const currentTab = tabs.find((tab) => tab.key === activeTab);
  const inspectorEmpty = tabs.length === 0;
  const fileCandidates = useMemo(() => collectFilePaths(tree), [tree]);

  const refreshTree = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setTree(await workspaceTree(workspaceId));
    } catch {
      setTree(null);
    }
  }, [workspaceId]);

  const refreshGit = useCallback(async () => {
    if (!workspaceId) return;
    setGitLoading(true);
    setGitError(null);
    try {
      setGitStatus(await workspaceGitStatus(workspaceId));
    } catch (err) {
      setGitError(err instanceof Error ? err.message : String(err));
    } finally {
      setGitLoading(false);
    }
  }, [workspaceId]);

  // 切换工作空间：从 localStorage 恢复标签 / 目录展开，并预加载已打开文件
  useEffect(() => {
    skipPersist.current = true;
    const nextTabs = hydrateTabs(restoredUi.tabs, {
      changes: t("inspector.section.changes"),
      files: t("inspector.section.files"),
    });
    const nextActive = resolveActiveKey(nextTabs, restoredUi.activeKey);
    setTabs(nextTabs);
    setActiveTab(nextActive);
    setTree(null);
    setOpenDirs(new Set(restoredUi.openDirs));
    setTreeQuery("");
    setSaveAs(null);
    draftSeq.current = 0;
    setSelectedPaths(new Set());
    setDrafts({});
    setSaved({});
    setUnsaved({});
    setMediaByKey({});
    setReadOnlyByPath({});
    setGitStatus(null);
    setRecents(loadFileRecents(workspaceId));
    if (!workspaceId) return;

    void refreshTree();
    void refreshGit();

    const filePaths = nextTabs
      .filter((tab): tab is Extract<StageTab, { kind: "file" }> => tab.kind === "file")
      .map((tab) => tab.path);
    let cancelled = false;
    void (async () => {
      for (const path of filePaths) {
        if (cancelled) return;
        await loadFileBuffers(workspaceId, path, {
          setDrafts,
          setSaved,
          setUnsaved,
          setMediaByKey,
          setReadOnlyByPath,
        });
      }
      if (!cancelled) skipPersist.current = false;
    })();
    if (filePaths.length === 0) skipPersist.current = false;

    return () => {
      cancelled = true;
    };
  }, [workspaceId, restoredUi, t, refreshTree, refreshGit]);

  // 标签 / 文件树开合等写回 localStorage
  useEffect(() => {
    if (!workspaceId || skipPersist.current) return;
    patchInspectorUi(workspaceId, {
      tabs: serializeTabs(tabs),
      activeKey: activeTab,
      filesListForced,
      filesListWidth,
      openDirs: [...openDirs],
    });
  }, [
    workspaceId,
    tabs,
    activeTab,
    filesListForced,
    filesListWidth,
    openDirs,
  ]);

  // Git：聚焦 + 12s 轮询（有 Changes 标签或空起始屏时）
  useEffect(() => {
    if (!workspaceId) return;
    void refreshGit();
    const onFocus = () => void refreshGit();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void refreshGit(), 12_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [workspaceId, refreshGit]);

  // 聊天 diff 等外部请求：打开文件并展开文件列表
  useEffect(() => {
    if (!pendingOpenPath) return;
    const path = pendingOpenPath;
    onPendingOpenPathConsumed?.();
    setFilesListOpen(true);
    void openFile(path);
    // openFile 读最新 state；仅在 pending 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenPath]);

  // Tab 条：纵向滚轮 → 横向滚动
  useEffect(() => {
    const strip = tabsRef.current;
    if (!strip || inspectorEmpty) return;
    function onWheel(event: WheelEvent) {
      if (!strip || strip.scrollWidth <= strip.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    }
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, [inspectorEmpty, tabs.length]);

  function ensureTab(tab: StageTab) {
    setTabs((prev) => {
      if (prev.some((t) => t.key === tab.key)) return prev;
      return [...prev, tab];
    });
    setActiveTab(tab.key);
  }

  function openChanges() {
    ensureTab({
      key: CHANGES_TAB_KEY,
      kind: "changes",
      title: t("inspector.section.changes"),
    });
  }

  function openFilesPane() {
    ensureTab({
      key: FILES_TAB_KEY,
      kind: "files",
      title: t("inspector.section.files"),
    });
  }

  /** Tab 条上的文件树开关；打开时若当前不在 Files 壳层则切到 Files。 */
  function onToggleFilesList() {
    if (!filesListOpen) {
      const kind = tabs.find((tab) => tab.key === activeTab)?.kind;
      if (kind !== "files" && kind !== "file") openFilesPane();
    }
    toggleFilesList();
  }

  async function openFile(path: string) {
    if (!workspaceId || !path) return;
    const key = fileTabKey(path);
    const title = baseName(path);
    setRecents(pushFileRecent(workspaceId, path));

    // 展开祖先目录
    setOpenDirs((prev) => {
      const next = new Set(prev);
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
      return next;
    });

    ensureTab({ key, kind: "file", title, path });

    // 已有草稿或媒体预览则不重新读盘
    if (drafts[key] != null || saved[key] != null || mediaByKey[key] != null) return;

    await loadFileBuffers(workspaceId, path, {
      setDrafts,
      setSaved,
      setUnsaved,
      setMediaByKey,
      setReadOnlyByPath,
    });
  }

  function clearTabBuffers(key: string) {
    setDrafts((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
    setSaved((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
    setUnsaved((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
    setMediaByKey((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
  }

  /** 将内容写入磁盘；未命名缓冲会迁到 `file:` 标签。 */
  async function writeFileAt(key: string, path: string) {
    if (!workspaceId) return;
    const content = drafts[key] ?? "";
    await workspaceWriteFile(workspaceId, path, content);
    const newKey = fileTabKey(path);
    const title = baseName(path);

    if (key !== newKey) {
      setTabs((prev) => {
        const next = prev.filter((tab) => tab.key !== key && tab.key !== newKey);
        return [...next, { key: newKey, kind: "file", title, path }];
      });
      setActiveTab(newKey);
      clearTabBuffers(key);
      setDrafts((d) => ({ ...d, [newKey]: content }));
      setSaved((d) => ({ ...d, [newKey]: content }));
      setUnsaved((d) => ({ ...d, [newKey]: false }));
      setReadOnlyByPath((d) => ({ ...d, [path]: false }));
    } else {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.key === key && tab.kind === "file" ? { ...tab, title, path } : tab,
        ),
      );
      setSaved((d) => ({ ...d, [key]: content }));
      setUnsaved((d) => ({ ...d, [key]: false }));
    }

    setRecents(pushFileRecent(workspaceId, path));
    setOpenDirs((prev) => {
      const next = new Set(prev);
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
      return next;
    });
    void refreshTree();
    void refreshGit();
  }

  async function saveFile() {
    if (!workspaceId || currentTab?.kind !== "file") return;
    const key = currentTab.key;
    if (currentTab.path && readOnlyByPath[currentTab.path]) return;
    // 未命名：先弹路径再落盘（Electron 无 window.prompt）
    if (!currentTab.path || isDraftTabKey(key)) {
      setSaveAs({ key, draft: "untitled.ts" });
      return;
    }
    await writeFileAt(key, currentTab.path);
  }

  async function commitSaveAs() {
    if (!saveAs) return;
    const path = normalizeRelPath(saveAs.draft);
    if (!path) return;
    const key = saveAs.key;
    setSaveAs(null);
    await writeFileAt(key, path);
  }

  /** 新建：直接打开未命名编辑器，保存时再填路径。 */
  function onNewFile() {
    draftSeq.current += 1;
    const n = draftSeq.current;
    const key = `draft:${n}`;
    const base = t("inspector.files.untitled");
    const title = n === 1 ? base : `${base} ${n}`;
    ensureTab({ key, kind: "file", title, path: "" });
    setDrafts((d) => ({ ...d, [key]: "" }));
    setSaved((d) => ({ ...d, [key]: "" }));
    setUnsaved((d) => ({ ...d, [key]: true }));
  }

  function closeTab(key: string) {
    const tab = tabs.find((t) => t.key === key);
    if (tab?.kind === "file" && unsaved[key]) {
      const ok = window.confirm(t("inspector.files.discardConfirm"));
      if (!ok) return;
    }
    setTabs((prev) => {
      const next = prev.filter((t) => t.key !== key);
      if (activeTab === key) {
        const idx = prev.findIndex((t) => t.key === key);
        const fallback = next[Math.max(0, idx - 1)] ?? next[0];
        setActiveTab(fallback?.key ?? "");
      }
      return next;
    });
    if (key.startsWith("file:") || isDraftTabKey(key)) {
      clearTabBuffers(key);
    }
  }

  function onFileDraftChange(value: string) {
    if (currentTab?.kind !== "file") return;
    const key = currentTab.key;
    setDrafts((d) => ({ ...d, [key]: value }));
    setUnsaved((d) => ({ ...d, [key]: value !== (saved[key] ?? "") }));
  }

  const { root: filteredTree, expandPaths: treeExpandPaths } = useMemo(
    () => filterWorkspaceTree(tree, treeQuery),
    [tree, treeQuery],
  );

  const effectiveOpenDirs = useMemo(() => {
    if (!treeQuery.trim() || !treeExpandPaths.size) return openDirs;
    const next = new Set(openDirs);
    for (const p of treeExpandPaths) next.add(p);
    return next;
  }, [openDirs, treeExpandPaths, treeQuery]);

  const visiblePaths = useMemo(
    () => visibleTreePaths(filteredTree ?? tree, effectiveOpenDirs),
    [filteredTree, tree, effectiveOpenDirs],
  );

  const selectionJoins = useMemo(
    () => selectionJoinFlags(visiblePaths, selectedPaths),
    [visiblePaths, selectedPaths],
  );

  function onTreeSelect(node: WorkspaceNode, gesture: TreeSelectGesture) {
    if (!tree) return;
    if (node.type === "dir" && !gesture.shift && !gesture.toggle) {
      setOpenDirs((prev) => {
        const next = new Set(prev);
        if (next.has(node.path)) next.delete(node.path);
        else next.add(node.path);
        return next;
      });
      return;
    }
    const result = applyTreeSelection({
      visible: visiblePaths,
      selected: [...selectedPaths],
      anchor: anchorPath,
      path: node.path,
      toggle: gesture.toggle,
      range: gesture.shift,
    });
    setSelectedPaths(new Set(result.selected));
    setAnchorPath(result.anchor);
    if (node.type === "file" && !gesture.shift && !gesture.toggle) {
      void openFile(node.path);
    }
  }

  function onSendAction(action: ChangesPromptActionId) {
    const prompt = CHANGES_ACTION_PROMPTS[action];
    if (!prompt) return;
    if (!gitStatus?.gitAvailable) {
      setGitError(t("inspector.changes.gitMissingBody"));
      return;
    }
    if (!gitStatus.isRepo) {
      setGitError(t("inspector.changes.notRepoBody"));
      return;
    }
    onSendPrompt?.(prompt);
  }

  async function initRepo() {
    if (!workspaceId) return;
    const result = await workspaceGitInit(workspaceId);
    if (!result.ok) {
      setGitError(result.error || t("inspector.changes.initFailed"));
      return;
    }
    void refreshGit();
  }

  if (!workspaceId) {
    return (
      <div className="agent-inspector">
        <EmptyState
          title={t("inspector.noWorkspaceTitle")}
          description={t("inspector.noWorkspaceBody")}
        />
      </div>
    );
  }

  if (!window.thinker?.workspaceFs) {
    return (
      <div className="agent-inspector">
        <EmptyState
          title={t("inspector.unavailableTitle")}
          description={t("inspector.unavailableBody", { cmd: "pnpm run dev" })}
        />
      </div>
    );
  }

  const totals = gitStatus?.totals;
  const showFileShell =
    currentTab?.kind === "files" || currentTab?.kind === "file";
  const showFilesHome = currentTab?.kind === "files";

  return (
    <aside className="agent-inspector" data-pane="workspace">
      {inspectorEmpty ? (
        <div className="agent-start">
          <button type="button" className="agent-start__item" onClick={openChanges}>
            <span className="agent-start__ico">
              <GitIcon />
            </span>
            <span className="agent-start__label">{t("inspector.section.changes")}</span>
            {totals && (totals.added > 0 || totals.removed > 0) ? (
              <span className="agent-start__stats">
                <span className="changes-pane__add">+{totals.added}</span>
                <span className="changes-pane__del">−{totals.removed}</span>
              </span>
            ) : null}
          </button>
          <button type="button" className="agent-start__item" onClick={openFilesPane}>
            <span className="agent-start__ico">
              <FileStartIcon />
            </span>
            <span className="agent-start__label">{t("inspector.section.files")}</span>
          </button>
        </div>
      ) : (
        <>
          <div className="agent-inspector__tabs" ref={tabsRef}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`agent-inspector__tab${tab.key === activeTab ? " is-active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
                onMouseDown={(e: ReactMouseEvent) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(tab.key);
                  }
                }}
                title={tab.kind === "file" ? tab.path : tab.title}
              >
                {tab.kind === "file" ? (
                  <span className="agent-inspector__lang">{langBadge(tab.path)}</span>
                ) : tab.kind === "changes" ? (
                  <span className="agent-inspector__tab-ico">
                    <GitIcon />
                  </span>
                ) : (
                  <span className="agent-inspector__tab-ico">
                    <FileStartIcon />
                  </span>
                )}
                <span className="agent-inspector__tab-title">{tab.title}</span>
                {unsaved[tab.key] ? <span className="stage-tab-dirty" aria-label="unsaved" /> : null}
                <span
                  className="agent-inspector__tab-close"
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.key);
                  }}
                >
                  ×
                </span>
              </button>
            ))}
            <button
              type="button"
              className="agent-inspector__tab-add"
              title={t("inspector.files.openSearch")}
              aria-label={t("inspector.files.openSearch")}
              onClick={openFilesPane}
            >
              +
            </button>
            <button
              type="button"
              className={`agent-inspector__tab-add${filesListOpen ? " is-on" : ""}`}
              title={
                filesListOpen ? t("inspector.files.hideTree") : t("inspector.files.showTree")
              }
              aria-label={
                filesListOpen ? t("inspector.files.hideTree") : t("inspector.files.showTree")
              }
              aria-pressed={filesListOpen}
              onClick={onToggleFilesList}
            >
              <IconPanelHide />
            </button>
          </div>

          <div className="agent-inspector__body">
            {currentTab?.kind === "changes" ? (
              <ChangesPane
                workspaceId={workspaceId}
                status={gitStatus}
                loading={gitLoading}
                error={gitError}
                onRefresh={() => void refreshGit()}
                onInitRepo={() => void initRepo()}
                onOpenFile={(path) => void openFile(path)}
                onSendAction={onSendAction}
              />
            ) : null}

            {showFileShell ? (
              <div
                ref={filesPaneRef}
                className={`agent-files${filesListOpen ? " has-side" : ""}`}
              >
                <div className="agent-files__main">
                  {showFilesHome ? (
                    <FilesHome
                      recents={recents}
                      fileCandidates={fileCandidates}
                      onOpenFile={(path) => void openFile(path)}
                      onNewFile={onNewFile}
                      onQuickOpen={openFilesPane}
                    />
                  ) : currentTab?.kind === "file" ? (
                    <div className="agent-files__editor">
                      {mediaByKey[currentTab.key] ? (
                        <MediaPreview
                          path={currentTab.path || t("inspector.files.untitled")}
                          info={mediaByKey[currentTab.key]!}
                        />
                      ) : (
                        <FileEditor
                          path={currentTab.path || null}
                          modelPath={currentTab.key}
                          value={drafts[currentTab.key] ?? ""}
                          dirty={Boolean(unsaved[currentTab.key])}
                          readOnly={Boolean(
                            currentTab.path && readOnlyByPath[currentTab.path],
                          )}
                          onChange={onFileDraftChange}
                          onSave={() => void saveFile()}
                        />
                      )}
                    </div>
                  ) : null}
                </div>

                {filesListOpen ? (
                  <aside className="agent-files__side" style={{ width: filesListWidth }}>
                    <div
                      className={`filelist-splitter${filesListDragging ? " is-dragging" : ""}`}
                      onPointerDown={onFilesListResize}
                      role="separator"
                      aria-orientation="vertical"
                      aria-valuenow={filesListWidth}
                      aria-valuemin={FILE_LIST_WIDTH.min}
                      aria-valuemax={FILE_LIST_WIDTH.max}
                      aria-label={t("inspector.files.resizeTree")}
                    />
                    <label className="changes-filelist__search">
                      <span className="changes-filelist__search-ico" aria-hidden>
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
                      <input
                        type="text"
                        value={treeQuery}
                        onChange={(e) => setTreeQuery(e.target.value)}
                        placeholder={t("inspector.changes.searchFiles")}
                        aria-label={t("inspector.changes.searchFiles")}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <div className="agent-files__tree">
                      {filteredTree ?? tree ? (
                        <FileTree
                          node={(filteredTree ?? tree)!}
                          openDirs={effectiveOpenDirs}
                          focusPath={
                            currentTab?.kind === "file" ? currentTab.path : null
                          }
                          selectedPaths={selectedPaths}
                          selectionJoins={selectionJoins}
                          onSelect={onTreeSelect}
                          onContextMenu={(e, node) => {
                            e.preventDefault();
                            if (node.type === "file") void openFile(node.path);
                          }}
                        />
                      ) : (
                        <div className="ws-empty">{t("inspector.files.emptyTree")}</div>
                      )}
                    </div>
                  </aside>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}

      <Modal
        open={Boolean(saveAs)}
        onClose={() => setSaveAs(null)}
        closeOnBackdrop
        closeOnEscape
        aria-label={t("inspector.files.saveAsTitle")}
      >
        <h2 className="components-modal-title">{t("inspector.files.saveAsTitle")}</h2>
        {saveAs ? (
          <Field label={t("inspector.files.newFilePrompt")} htmlFor="inspector-save-as">
            <Input
              id="inspector-save-as"
              value={saveAs.draft}
              autoFocus
              onChange={(e) => setSaveAs({ ...saveAs, draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitSaveAs();
              }}
            />
          </Field>
        ) : null}
        <div className="components-row components-row--end">
          <Button variant="ghost" onClick={() => setSaveAs(null)}>
            {t("inspector.files.saveAsCancel")}
          </Button>
          <Button variant="primary" onClick={() => void commitSaveAs()}>
            {t("inspector.files.save")}
          </Button>
        </div>
      </Modal>
    </aside>
  );
}
