/**
 * 右侧 agent inspector（对齐 v1 WorkspacePane agent 分支）：
 * 起始磁贴 → Tab 条（Changes / Files / file:*）→ 对应壳层。
 *
 * 本文件为编排壳：状态 / 订阅 / 派生数据 / 组合。
 * 标签与文件操作见 ./useFileTabs，子代理 tab 见 ./useSubagentTabs，
 * 标签条 / 起始屏 / 文件壳 / 模态框见同目录组件，纯函数见 ./tabs。
 */
import { EmptyState } from "@thinker-workbench/design/react";
import type { GitStatus, WorkspaceNode } from "@thinker-workbench/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  browserGetState,
  browserNavigate,
  consumePendingOpenBrowser,
  OPEN_BROWSER_EVENT,
  type OpenBrowserDetail,
  onBrowserEvent,
} from "../../../bridge/browser";
import { peekOpenSubagents, subagentTabKey } from "../../../bridge/subagent";
import { OPEN_TERMINAL_EVENT, type OpenTerminalDetail } from "../../../bridge/terminal";
import { workspaceGitInit, workspaceGitStatus, workspaceTree } from "../../../bridge/workspaceFs";
import { useT } from "../../../i18n/useI18n";
import { BrowserPane } from "../../browser/BrowserPane";
import { TerminalPane } from "../../terminal/TerminalPane";
import { CHANGES_ACTION_PROMPTS, ChangesPane, type ChangesPromptActionId } from "../ChangesPane";
import { buildFullTree, type ChangeTreeNode } from "../changesTree";
import { loadFileRecents } from "../fileRecents";
import {
  hydrateTabs,
  loadInspectorUi,
  patchInspectorUi,
  resolveActiveKey,
  serializeTabs,
} from "../inspectorUi";
import type { MediaPreviewInfo } from "../MediaPreview";
import { SubagentInspectorPane } from "../SubagentInspectorPane";
import type { TreeGesture } from "../TreeView";
import {
  applyTreeSelection,
  filterWorkspaceTree,
  selectionJoinFlags,
  visibleTreePaths,
} from "../treeSelection";
import { BROWSER_TAB_KEY, type StageTab, TERMINAL_TAB_KEY } from "../types";
import { FILE_LIST_AUTO_PANE_MIN, useFileListOpen, useFileListWidth } from "../useFileListPanel";
import "../inspector.less";
import { FileShell, type TreeCtxMenu } from "./FileShell";
import { loadFileBuffers } from "./fileBuffers";
import { InspectorModals } from "./InspectorModals";
import { StartScreen } from "./StartScreen";
import { TabStrip } from "./TabStrip";
import { collectFilePaths } from "./tabs";
import { useFileTabs } from "./useFileTabs";
import { openSubagentTabs, useActiveSubagentTaskSync, useSubagentTabs } from "./useSubagentTabs";

type Props = {
  workspaceId: string | null;
  /** 聊天页是否为当前页（切到组件 / 设置等页时为 false：隐藏原生浏览器 view）。*/
  pageActive?: boolean;
  /** Changes CTA：把固定英文 prompt 发给当前会话。*/
  onSendPrompt?: (prompt: string) => void;
  /** 外部请求打开的工作空间相对路径（如聊天 diff 点文件名）；消费后回调清空。*/
  pendingOpenPath?: string | null;
  onPendingOpenPathConsumed?: () => void;
  /** 外部请求打开 Terminal 并可选聚焦会话。*/
  pendingOpenTerminalSessionId?: string | null;
  onPendingOpenTerminalConsumed?: () => void;
};

/** 未命名缓冲首次保存：填写相对路径。 */
type SaveAsState = {
  key: string;
  draft: string;
  /** 保存成功后关闭该标签（来自未保存关闭确认）。*/
  closeAfter?: boolean;
};

export function RightInspector({
  workspaceId,
  pageActive = true,
  onSendPrompt,
  pendingOpenPath,
  onPendingOpenPathConsumed,
  pendingOpenTerminalSessionId,
  onPendingOpenTerminalConsumed,
}: Props) {
  const t = useT();
  const draftSeq = useRef(0);
  /** 跳过恢复后的首次写回，避免用空态覆盖 localStorage。*/
  const skipPersist = useRef(true);

  const restoredUi = useMemo(() => loadInspectorUi(workspaceId), [workspaceId]);

  const [tabs, setTabs] = useState<StageTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  /** TerminalPane 聚焦会话（打开面板后消费）。*/
  const [terminalFocusId, setTerminalFocusId] = useState<string | null>(null);
  const [browserPendingUrl, setBrowserPendingUrl] = useState<string | null>(null);
  /** 未命名缓冲首次保存：填写相对路径。*/
  const [saveAs, setSaveAs] = useState<SaveAsState | null>(null);
  /** 关闭脏文件标签时的确认弹窗（tab key）。*/
  const [closeDirtyKey, setCloseDirtyKey] = useState<string | null>(null);

  const [tree, setTree] = useState<WorkspaceNode | null>(null);
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set());
  const [treeQuery, setTreeQuery] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  /** 重启后待还原的浏览器地址（切到浏览器 tab 且主进程为空白页时消费）。 */
  const [pendingBrowserRestore, setPendingBrowserRestore] = useState<string>("");

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [unsaved, setUnsaved] = useState<Record<string, boolean>>({});
  const [readOnlyByPath, setReadOnlyByPath] = useState<Record<string, boolean>>({});
  /** 媒体 / 二进制预览缓存（?file: tab key）。*/
  const [mediaByKey, setMediaByKey] = useState<Record<string, MediaPreviewInfo>>({});

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);

  const {
    open: filesListOpen,
    forced: filesListForced,
    setOpen: setFilesListOpen,
    paneRef: filesPaneRef,
  } = useFileListOpen(FILE_LIST_AUTO_PANE_MIN, workspaceId ?? "", restoredUi.filesListForced);
  const {
    width: filesListWidth,
    dragging: filesListDragging,
    onResizePointerDown: onFilesListResize,
  } = useFileListWidth(restoredUi.filesListWidth, workspaceId ?? "");

  async function copyPathText(path: string) {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      /* ignore */
    }
  }

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
      // git 刷新时同步树：agent 新建 / 删除的文件及时进侧栏全量列表
      void refreshTree();
    } catch (err) {
      setGitError(err instanceof Error ? err.message : String(err));
    } finally {
      setGitLoading(false);
    }
  }, [workspaceId, refreshTree]);

  const {
    ensureTab,
    openTerminal,
    openBrowser,
    openChanges,
    openFilesPane,
    openFile,
    saveFile,
    commitSaveAs,
    onNewFile,
    closeTab,
    saveAndCloseDirty,
    discardAndCloseDirty,
    onFileDraftChange,
  } = useFileTabs(
    {
      workspaceId,
      currentTab: tabs.find((tab) => tab.key === activeTab),
      tabs,
      drafts,
      saved,
      unsaved,
      readOnlyByPath,
      mediaByKey,
      saveAs,
      closeDirtyKey,
      draftSeq,
      refreshTree,
      refreshGit,
    },
    {
      setTabs,
      setActiveTab,
      setTerminalFocusId,
      setBrowserPendingUrl,
      setDrafts,
      setSaved,
      setUnsaved,
      setReadOnlyByPath,
      setMediaByKey,
      setRecents,
      setOpenDirs,
      setSaveAs,
      setCloseDirtyKey,
    },
  );

  useSubagentTabs({ ensureTab, setTabs, setActiveTab });
  useActiveSubagentTaskSync(activeTab);

  const currentTab = tabs.find((tab) => tab.key === activeTab);
  const inspectorEmpty = tabs.length === 0;
  const fileCandidates = useMemo(() => collectFilePaths(tree), [tree]);
  /** 侧栏文件树右键。*/
  const [treeCtxMenu, setTreeCtxMenu] = useState<TreeCtxMenu | null>(null);

  // 切换工作空间：从 localStorage 恢复标签 / 目录展开，并预加载已打开文件
  useEffect(() => {
    skipPersist.current = true;
    const nextTabs = hydrateTabs(restoredUi.tabs, {
      changes: t("inspector.section.changes"),
      files: t("inspector.section.files"),
      terminal: t("inspector.section.terminal"),
      browser: t("inspector.section.browser"),
    });
    // 合并当前会话已打开的 Task（按会话落盘，不进 inspectorUi 里）
    const openSub = peekOpenSubagents();
    const subTabs = openSubagentTabs(t);
    const mergedTabs = [...nextTabs, ...subTabs];
    const preferSub =
      openSub.activeTaskId && subTabs.some((tab) => tab.taskId === openSub.activeTaskId)
        ? subagentTabKey(openSub.activeTaskId)
        : "";
    const nextActive = preferSub || resolveActiveKey(mergedTabs, restoredUi.activeKey);
    setTabs(mergedTabs);
    setActiveTab(nextActive);
    setTree(null);
    setOpenDirs(new Set(restoredUi.openDirs));
    setTreeQuery("");
    setSaveAs(null);
    setCloseDirtyKey(null);
    draftSeq.current = 0;
    setSelectedPaths(new Set());
    setDrafts({});
    setSaved({});
    setUnsaved({});
    setMediaByKey({});
    setReadOnlyByPath({});
    setGitStatus(null);
    setRecents(loadFileRecents(workspaceId));
    setPendingBrowserRestore(restoredUi.browserUrl || "");
    if (!workspaceId) return;

    void refreshTree();
    void refreshGit();

    const filePaths = nextTabs
      .filter((tab): tab is Extract<StageTab, { kind: "file" }> => tab.kind === "file")
      .map((tab) => tab.path);
    let cancelled = false;
    void (async () => {
      const missing = new Set<string>();
      for (const path of filePaths) {
        if (cancelled) return;
        const ok = await loadFileBuffers(workspaceId, path, {
          setDrafts,
          setSaved,
          setUnsaved,
          setMediaByKey,
          setReadOnlyByPath,
        });
        if (!ok) missing.add(path);
      }
      if (cancelled) return;
      // 会话里记下的文件若已删，丢掉对应 tab，避免空壳与反复读失败
      if (missing.size > 0) {
        setTabs((prev) => {
          const kept = prev.filter((tab) => !(tab.kind === "file" && missing.has(tab.path)));
          queueMicrotask(() => {
            setActiveTab((cur) => resolveActiveKey(kept, cur));
          });
          return kept;
        });
      }
      skipPersist.current = false;
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
  }, [workspaceId, tabs, activeTab, filesListForced, filesListWidth, openDirs]);

  // 浏览器 tab 激活时：主进程仍是空白页就还原上次地址（消费一次，不覆盖已有页面）
  useEffect(() => {
    if (activeTab !== BROWSER_TAB_KEY || !pendingBrowserRestore) return;
    const url = pendingBrowserRestore;
    setPendingBrowserRestore("");
    void (async () => {
      const s = await browserGetState();
      if (s?.url && s.url !== "about:blank") return;
      await browserNavigate(url);
    })();
  }, [activeTab, pendingBrowserRestore]);

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
    // openFile 读最新 state；依赖故意列入以拿新闭包，避免只触发一次后 stale
  }, [pendingOpenPath, openFile, setFilesListOpen, onPendingOpenPathConsumed]);

  // 外部 / 时间线：打开 Terminal 标签（细节由 TerminalPane 消费：
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<OpenTerminalDetail>).detail;
      openTerminal(detail?.sessionId);
    }
    window.addEventListener(OPEN_TERMINAL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TERMINAL_EVENT, onOpen);
  }, [openTerminal]);

  // Markdown 链接 / agent / 主进程：打开 Browser 标签
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<OpenBrowserDetail>).detail;
      openBrowser(detail?.url);
    }
    window.addEventListener(OPEN_BROWSER_EVENT, onOpen);
    const off = onBrowserEvent((event) => {
      // 主进程已导航：只开 Browser tab，勿再塞 pendingUrl（否则 navigate→reveal 死循环）
      if (event.type === "reveal") openBrowser();
    });
    const pending = consumePendingOpenBrowser();
    if (pending) openBrowser(pending.url);
    return () => {
      window.removeEventListener(OPEN_BROWSER_EVENT, onOpen);
      off();
    };
  }, [openBrowser]);

  useEffect(() => {
    if (pendingOpenTerminalSessionId == null) return;
    const id = pendingOpenTerminalSessionId;
    onPendingOpenTerminalConsumed?.();
    openTerminal(id || undefined);
  }, [pendingOpenTerminalSessionId, openTerminal, onPendingOpenTerminalConsumed]);

  const { root: filteredTree, expandPaths: treeExpandPaths } = useMemo(
    () => filterWorkspaceTree(tree, treeQuery),
    [tree, treeQuery],
  );
  // 展示用树根：优先过滤后的树，无过滤时回退全量树
  const treeRoot = filteredTree ?? tree;
  // 统一成 ChangeTreeNode[] 交给共享 TreeView（文件面板不展示 +/- 统计）
  const treeNodes = useMemo(() => (treeRoot ? buildFullTree(treeRoot, []) : []), [treeRoot]);

  const effectiveOpenDirs = useMemo(() => {
    if (!treeQuery.trim() || !treeExpandPaths.size) return openDirs;
    const next = new Set(openDirs);
    for (const p of treeExpandPaths) next.add(p);
    return next;
  }, [openDirs, treeExpandPaths, treeQuery]);

  const visiblePaths = useMemo(
    () => visibleTreePaths(treeRoot, effectiveOpenDirs),
    [treeRoot, effectiveOpenDirs],
  );

  const selectionJoins = useMemo(
    () => selectionJoinFlags(visiblePaths, selectedPaths),
    [visiblePaths, selectedPaths],
  );

  function onTreeActivate(node: ChangeTreeNode, gesture: TreeGesture) {
    if (!tree) return;
    // 目录：无修饰键时仅开关；带 Shift/Ctrl 走多选（不折叠）
    if (node.kind === "dir" && !gesture.shift && !gesture.toggle) {
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
    // 文件：无修饰键时打开；带 Shift/Ctrl 仅选中
    if (node.kind === "file" && !gesture.shift && !gesture.toggle) {
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
  const showFileShell = currentTab?.kind === "files" || currentTab?.kind === "file";
  const showFilesHome = currentTab?.kind === "files";

  return (
    <aside className="agent-inspector" data-pane="workspace">
      {inspectorEmpty ? (
        <StartScreen
          totals={totals}
          onOpenChanges={openChanges}
          onOpenFilesPane={openFilesPane}
          onOpenTerminal={() => openTerminal()}
          onOpenBrowser={() => openBrowser()}
        />
      ) : (
        <>
          <TabStrip
            tabs={tabs}
            activeTab={activeTab}
            unsaved={unsaved}
            onSelect={setActiveTab}
            onCloseTab={closeTab}
            onOpenChanges={openChanges}
            onOpenFiles={openFilesPane}
            onOpenTerminal={() => openTerminal()}
            onOpenBrowser={() => openBrowser()}
          />

          <div className="agent-inspector__body">
            {currentTab?.kind === "changes" ? (
              <ChangesPane
                workspaceId={workspaceId}
                status={gitStatus}
                loading={gitLoading}
                error={gitError}
                tree={tree}
                onRefresh={() => void refreshGit()}
                onInitRepo={() => void initRepo()}
                onOpenFile={(path) => void openFile(path)}
                onSendAction={onSendAction}
              />
            ) : null}

            {currentTab?.kind === "terminal" ? (
              <TerminalPane
                active={activeTab === TERMINAL_TAB_KEY}
                focusSessionId={terminalFocusId}
                onFocusSessionConsumed={() => setTerminalFocusId(null)}
              />
            ) : null}

            {currentTab?.kind === "browser" ? (
              <BrowserPane
                active={pageActive && activeTab === BROWSER_TAB_KEY}
                pendingUrl={browserPendingUrl}
                onPendingUrlConsumed={() => setBrowserPendingUrl(null)}
                workspaceId={workspaceId}
              />
            ) : null}

            {currentTab?.kind === "subagent" ? (
              <SubagentInspectorPane
                taskId={currentTab.taskId}
                subagent={currentTab.subagent}
                onOpenFile={(path) => void openFile(path)}
              />
            ) : null}

            {showFileShell ? (
              <FileShell
                currentTab={currentTab}
                showFilesHome={showFilesHome}
                filesPaneRef={filesPaneRef}
                filesListOpen={filesListOpen}
                filesListWidth={filesListWidth}
                filesListDragging={filesListDragging}
                onFilesListResize={onFilesListResize}
                recents={recents}
                fileCandidates={fileCandidates}
                onOpenFile={(path) => void openFile(path)}
                onNewFile={onNewFile}
                drafts={drafts}
                mediaByKey={mediaByKey}
                readOnlyByPath={readOnlyByPath}
                onFileDraftChange={onFileDraftChange}
                onSaveFile={() => void saveFile()}
                treeQuery={treeQuery}
                onTreeQueryChange={setTreeQuery}
                treeRoot={treeRoot}
                treeNodes={treeNodes}
                effectiveOpenDirs={effectiveOpenDirs}
                selectedPaths={selectedPaths}
                selectionJoins={selectionJoins}
                onTreeActivate={onTreeActivate}
                treeCtxMenu={treeCtxMenu}
                onTreeCtxMenu={setTreeCtxMenu}
                copyPathText={copyPathText}
              />
            ) : null}
          </div>
        </>
      )}

      <InspectorModals
        closeDirtyKey={closeDirtyKey}
        tabs={tabs}
        onCloseDirty={() => setCloseDirtyKey(null)}
        onDiscardAndClose={discardAndCloseDirty}
        onSaveAndClose={() => void saveAndCloseDirty()}
        saveAs={saveAs}
        onSaveAsChange={setSaveAs}
        onCommitSaveAs={() => void commitSaveAs()}
      />
    </aside>
  );
}
