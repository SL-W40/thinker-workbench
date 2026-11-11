/**
 * 右侧 agent inspector（对齐 v1 WorkspacePane agent 分支）：
 * Tab 条（Changes 常驻且不可关闭 / Files / file:*）→ 对应壳层。
 *
 * 本文件为编排壳：状态 / 订阅 / 派生数据 / 组合。
 * 标签与文件操作见 ./useFileTabs，子代理 tab 见 ./useSubagentTabs，
 * 标签条 / 文件壳 / 模态框见同目录组件，纯函数见 ./tabs。
 */
import { EmptyState } from "@thinker-workbench/design/react";
import type { BrowserState, ChatPlan, GitStatus, WorkspaceNode } from "@thinker-workbench/shared";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  browserGetState,
  consumePendingOpenBrowser,
  OPEN_BROWSER_EVENT,
  type OpenBrowserDetail,
  onBrowserEvent,
} from "../../../platform/ipc/browser";
import { peekOpenSubagents, subagentTabKey } from "../../../platform/ipc/subagent";
import { OPEN_TERMINAL_EVENT, type OpenTerminalDetail } from "../../../platform/ipc/terminal";
import {
  workspaceGitInit,
  workspaceGitStatus,
  workspaceReveal,
  workspaceTree,
} from "../../../platform/ipc/workspaceFs";
import { useStableCallback } from "../../../ui/hooks/useStableCallback";
import { useT } from "../../../ui/i18n/useI18n";
import { BrowserPane } from "../../browser/BrowserPane";
import { TerminalPane } from "../../terminal/TerminalPane";
import { CHANGES_ACTION_PROMPTS, ChangesPane, type ChangesPromptActionId } from "../ChangesPane";
import { buildFullTree, type ChangeTreeNode } from "../changesTree";
import { loadFileRecents, pruneFileRecents } from "../fileRecents";
import {
  browserTabTitle,
  hydrateTabs,
  loadInspectorUi,
  patchInspectorUi,
  pinChangesTab,
  resolveActiveKey,
  serializeTabs,
} from "../inspectorUi";
import type { MediaPreviewInfo } from "../MediaPreview";
import { PlanPane } from "../PlanPane";
import { SubagentInspectorPane } from "../SubagentInspectorPane";
import type { TreeGesture } from "../TreeView";
import {
  applyTreeSelection,
  filterWorkspaceTree,
  selectionJoinFlags,
  visibleTreePaths,
} from "../treeSelection";
import { CHANGES_TAB_KEY, FILES_TAB_KEY, type StageTab, TERMINAL_TAB_KEY } from "../types";
import "../inspector.less";
import { FileShell, type TreeCtxMenu } from "./FileShell";
import { loadFileBuffers } from "./fileBuffers";
import { InspectorModals } from "./InspectorModals";
import { TabStrip } from "./TabStrip";
import { browserTabKey, collectFilePaths } from "./tabs";
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
  /** 外部请求打开计划文档预览（虚拟文档，携带完整计划内容）。 */
  pendingOpenPlan?: ChatPlan | null;
  onPendingOpenPlanConsumed?: () => void;
  /**
   * 当前会话的活跃计划（随消息实时变化）。
   * id 与标签 planId 匹配时优先用它渲染，使执行中的待办更新实时反映在面板。
   */
  activePlan?: ChatPlan | null;
  /** 当前会话是否在跑：决定计划底部待办的「进行中」是否真的转圈。 */
  busy?: boolean;
};

/** 未命名缓冲首次保存：填写相对路径。 */
type SaveAsState = {
  key: string;
  draft: string;
  /** 保存成功后关闭该标签（来自未保存关闭确认）。*/
  closeAfter?: boolean;
};

/**
 * memo：右侧面板内含编辑器 / 终端 / 文件树，是最重的子树之一；
 * 顶层 state 变化（拖面板宽度等）不该让它连带重渲染整棵文件树。
 */
export const RightInspector = memo(function RightInspector({
  workspaceId,
  pageActive = true,
  onSendPrompt,
  pendingOpenPath,
  onPendingOpenPathConsumed,
  pendingOpenTerminalSessionId,
  onPendingOpenTerminalConsumed,
  pendingOpenPlan,
  onPendingOpenPlanConsumed,
  activePlan = null,
  busy = false,
}: Props) {
  const t = useT();
  const draftSeq = useRef(0);
  /** 跳过恢复后的首次写回，避免用空态覆盖 localStorage。*/
  const skipPersist = useRef(true);

  const restoredUi = useMemo(() => loadInspectorUi(workspaceId), [workspaceId]);

  const [tabs, setTabs] = useState<StageTab[]>(() => [
    { key: CHANGES_TAB_KEY, kind: "changes", title: t("inspector.section.changes") },
  ]);
  const [activeTab, setActiveTab] = useState<string>(CHANGES_TAB_KEY);
  /** TerminalPane 聚焦会话（打开面板后消费）。*/
  const [terminalFocusId, setTerminalFocusId] = useState<string | null>(null);
  /** 未命名缓冲首次保存：填写相对路径。*/
  const [saveAs, setSaveAs] = useState<SaveAsState | null>(null);
  /** 关闭脏文件标签时的确认弹窗（tab key）。*/
  const [closeDirtyKey, setCloseDirtyKey] = useState<string | null>(null);
  /** 计划文档内容（按 planId 存；虚拟文档，不落工作空间）。 */
  const [planDocs, setPlanDocs] = useState<Record<string, ChatPlan>>({});

  const [tree, setTree] = useState<WorkspaceNode | null>(null);
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set());
  const [treeQuery, setTreeQuery] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  // 最近打开的路径经 setRecents 落到 localStorage，给 @ 提及用。
  const [, setRecents] = useState<string[]>([]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [unsaved, setUnsaved] = useState<Record<string, boolean>>({});
  const [readOnlyByPath, setReadOnlyByPath] = useState<Record<string, boolean>>({});
  /** 媒体 / 二进制预览缓存（?file: tab key）。*/
  const [mediaByKey, setMediaByKey] = useState<Record<string, MediaPreviewInfo>>({});

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);

  async function copyPathText(path: string) {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      /* ignore */
    }
  }

  const refreshTree = useCallback(async () => {
    if (!workspaceId) return;
    let next: WorkspaceNode | null;
    try {
      next = await workspaceTree(workspaceId);
    } catch {
      next = null;
    }
    // 内容没变就保留旧引用：setTree 每次给新对象会击穿下游 5 个 useMemo，
    // 让整棵文件树重渲染。12s 轮询 / 窗口聚焦绝大多数时候内容其实没变，
    // 一次序列比对远比整棵树重渲染便宜。
    setTree((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
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
    openFile,
    openPlan,
    saveFile,
    commitSaveAs,
    onNewFile,
    closeTab,
    closeTabs,
    cancelDirtyClose,
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

  // 已访问过的 tab key：白名单内的 pane 首次激活后常驻，切走时用 visibility 隐藏而不是卸载。
  // 切 tab 最贵的单项是 xterm 重建（建实例 + FitAddon + 全量输出回放）和
  // Changes 的 diff 重新拉取，而它们常驻的成本几乎为零。
  // 不保活 file:*（每个 Monaco editor 独占一个 web worker，开多了是百 MB 级）。
  // 浏览器标签按 tab 常驻：切走只是隐藏，页面留在各自的 webview 里。
  const visitedTabsRef = useRef<Set<string>>(new Set());
  if (currentTab) visitedTabsRef.current.add(currentTab.key);
  // 关掉的 tab 不再保活：空占一份 xterm / diff 没意义
  const isPaneAlive = (key: string): boolean =>
    currentTab?.key === key ||
    (tabs.some((tab) => tab.key === key) && visitedTabsRef.current.has(key));

  const fileCandidates = useMemo(() => collectFilePaths(tree), [tree]);
  /** 侧栏文件树右键。*/
  const [treeCtxMenu, setTreeCtxMenu] = useState<TreeCtxMenu | null>(null);

  // 文件树刷新后，剔除最近列表里已被删除的文件（并写回 localStorage）
  useEffect(() => {
    // 树未加载（null）时不校验，避免把全部最近记录误删
    if (tree === null) return;
    setRecents((prev) => pruneFileRecents(workspaceId, prev, fileCandidates));
  }, [fileCandidates, tree, workspaceId]);

  // 切换工作空间：从 localStorage 恢复标签 / 目录展开，并预加载已打开文件
  useEffect(() => {
    skipPersist.current = true;
    const nextTabs = hydrateTabs(
      restoredUi.tabs,
      {
        changes: t("inspector.section.changes"),
        files: t("inspector.section.files"),
        terminal: t("inspector.section.terminal"),
        browser: t("inspector.section.browser"),
        plan: t("inspector.section.plan"),
      },
      restoredUi.browserUrl,
    );
    // 合并当前会话已打开的 Task（按会话落盘，不进 inspectorUi 里）
    const openSub = peekOpenSubagents();
    const subTabs = openSubagentTabs(t);
    const mergedTabs = pinChangesTab([...nextTabs, ...subTabs], t("inspector.section.changes"));
    const preferSub =
      openSub.activeTaskId && subTabs.some((tab) => tab.taskId === openSub.activeTaskId)
        ? subagentTabKey(openSub.activeTaskId)
        : "";
    const storedActive =
      restoredUi.activeKey === "browser" ? browserTabKey("legacy") : restoredUi.activeKey;
    const nextActive = preferSub || resolveActiveKey(mergedTabs, storedActive);
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
      openDirs: [...openDirs],
    });
  }, [workspaceId, tabs, activeTab, openDirs]);

  // Git：聚焦 + 12s 轮询（变更面板常驻，状态要跟着工作区走）
  // 页面不在前台或窗口不可见时不轮询：切到组件 / 设置页之后，每 12s 一次
  // git status（spawn 子进程）+ 主进程全量 readdir，结果用户根本看不见，
  // 却会周期性刷出一次卡顿。
  useEffect(() => {
    if (!workspaceId || !pageActive) return;
    void refreshGit();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refreshGit();
    };
    window.addEventListener("focus", refreshGit);
    const timer = window.setInterval(tick, 12_000);
    return () => {
      window.removeEventListener("focus", refreshGit);
      window.clearInterval(timer);
    };
  }, [workspaceId, pageActive, refreshGit]);

  // 聊天 diff 等外部请求：打开对应文件。
  useEffect(() => {
    if (!pendingOpenPath) return;
    const path = pendingOpenPath;
    onPendingOpenPathConsumed?.();
    void openFile(path);
    // openFile 读最新 state；依赖故意列入以拿新闭包，避免只触发一次后 stale
  }, [pendingOpenPath, openFile, onPendingOpenPathConsumed]);

  // 对话计划卡片：打开计划文档预览（虚拟文档，内容随会话消息持久化）
  useEffect(() => {
    if (!pendingOpenPlan) return;
    const plan = pendingOpenPlan;
    onPendingOpenPlanConsumed?.();
    setPlanDocs((prev) => ({ ...prev, [plan.id]: plan }));
    openPlan(plan);
  }, [pendingOpenPlan, openPlan, onPendingOpenPlanConsumed]);

  // 外部 / 时间线：打开 Terminal 标签（细节由 TerminalPane 消费：
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<OpenTerminalDetail>).detail;
      openTerminal(detail?.sessionId);
    }
    window.addEventListener(OPEN_TERMINAL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TERMINAL_EVENT, onOpen);
  }, [openTerminal]);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // 外部链接新开标签；标签内导航 / 主进程 reveal 只切到已有浏览器标签。页面标题写回当前标签。
  useEffect(() => {
    const fallback = t("inspector.section.browser");
    const applyPage = (state: BrowserState) => {
      const key = activeTabRef.current;
      const nextTitle = browserTabTitle(state, fallback);
      const nextUrl = state.url.trim();
      setTabs((prev) => {
        const idx = prev.findIndex((tab) => tab.key === key);
        const cur = idx >= 0 ? prev[idx] : undefined;
        if (cur?.kind !== "browser") return prev;
        const url = nextUrl && nextUrl !== "about:blank" ? nextUrl : cur.url;
        if (cur.title === nextTitle && cur.url === url) return prev;
        const next = prev.slice();
        next[idx] = { ...cur, title: nextTitle, url };
        return next;
      });
    };
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<OpenBrowserDetail>).detail;
      openBrowser(detail?.url, "new");
    }
    window.addEventListener(OPEN_BROWSER_EVENT, onOpen);
    const off = onBrowserEvent((event) => {
      // 主进程已经在当前 webview 里导航过：只把对应标签露出来，不要再开一个
      if (event.type === "reveal") openBrowser(event.url, event.newTab ? "new" : "focus");
      if (event.type === "state") applyPage(event.state);
    });
    void browserGetState().then((state) => {
      if (state) applyPage(state);
    });
    const pending = consumePendingOpenBrowser();
    if (pending) openBrowser(pending.url, "new");
    return () => {
      window.removeEventListener(OPEN_BROWSER_EVENT, onOpen);
      off();
    };
  }, [openBrowser, t]);

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
  // 标签栏浮窗用未过滤的全量树，不跟着文件面板的搜索框收窄。
  const flyoutTreeNodes = useMemo(() => (tree ? buildFullTree(tree, []) : []), [tree]);

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

  function toggleDir(path: string) {
    setOpenDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

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

  // 下游（文件树 TreeView、变更列表行）都是 memo 的，回调引用不稳定会让 memo 全部失效。
  // 这两个函数都读一堆 state，不适合直接 useCallback（依赖一变引用就变、还有过期闭包风险），
  // 用 useStableCallback 转发给最新一次渲染的闭包：引用恒定，行为不变。
  const stableTreeActivate = useStableCallback(onTreeActivate);
  const stableOpenFile = useStableCallback((path: string) => {
    void openFile(path);
  });

  // 四个 pane（Changes / Terminal / Browser / FileShell）本身也包了 memo，
  // 传进 pane 的回调同样必须引用稳定，否则 pane 级 memo 形同虚设。
  const stableSendAction = useStableCallback(onSendAction);
  const stableRefreshGit = useStableCallback(() => {
    void refreshGit();
  });
  const stableRefreshTree = useStableCallback(() => {
    void refreshTree();
  });
  const stableInitRepo = useStableCallback(() => {
    void initRepo();
  });
  const stableSaveFile = useStableCallback(() => {
    void saveFile();
  });
  const stableConsumeTerminalFocus = useStableCallback(() => setTerminalFocusId(null));

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

  const showFileShell = currentTab?.kind === "files" || currentTab?.kind === "file";
  const showFileTree = currentTab?.kind === "files";

  return (
    <aside className="agent-inspector" data-pane="workspace">
      <TabStrip
        tabs={tabs}
        activeTab={activeTab}
        unsaved={unsaved}
        fileCount={tree ? fileCandidates.length : null}
        treeNodes={flyoutTreeNodes}
        openDirs={openDirs}
        onToggleDir={toggleDir}
        onOpenFile={stableOpenFile}
        onSelect={setActiveTab}
        onCloseTab={closeTab}
        onCloseTabs={closeTabs}
        onOpenChanges={openChanges}
        onOpenTerminal={() => openTerminal()}
        onOpenBrowser={() => openBrowser()}
        onCopyPath={(path) => void copyPathText(path)}
        onRevealPath={(path) => {
          if (!workspaceId) return;
          void workspaceReveal(workspaceId, path);
        }}
      />

      <div className="agent-inspector__body">
        {isPaneAlive(CHANGES_TAB_KEY) ? (
          <div
            className="agent-inspector__pane"
            hidden={currentTab?.kind !== "changes"}
            inert={currentTab?.kind !== "changes" || undefined}
          >
            <ChangesPane
              workspaceId={workspaceId}
              status={gitStatus}
              loading={gitLoading}
              error={gitError}
              onRefresh={stableRefreshGit}
              onInitRepo={stableInitRepo}
              onOpenFile={stableOpenFile}
              onSendAction={stableSendAction}
            />
          </div>
        ) : null}

        {isPaneAlive(TERMINAL_TAB_KEY) ? (
          <div
            className="agent-inspector__pane"
            hidden={currentTab?.kind !== "terminal"}
            inert={currentTab?.kind !== "terminal" || undefined}
          >
            <TerminalPane
              active={activeTab === TERMINAL_TAB_KEY}
              focusSessionId={terminalFocusId}
              onFocusSessionConsumed={stableConsumeTerminalFocus}
            />
          </div>
        ) : null}

        {tabs.map((tab) =>
          tab.kind === "browser" ? (
            <div
              key={tab.key}
              className="agent-inspector__pane"
              hidden={currentTab?.key !== tab.key || undefined}
              inert={currentTab?.key !== tab.key || undefined}
            >
              <BrowserPane active={pageActive && activeTab === tab.key} initialUrl={tab.url} />
            </div>
          ) : null,
        )}

        {currentTab?.kind === "subagent" ? (
          <SubagentInspectorPane
            taskId={currentTab.taskId}
            subagent={currentTab.subagent}
            onOpenFile={stableOpenFile}
          />
        ) : null}

        {currentTab?.kind === "plan" ? (
          <PlanPane
            plan={
              activePlan?.id === currentTab.planId
                ? activePlan
                : (planDocs[currentTab.planId] ?? null)
            }
            running={busy}
          />
        ) : null}

        {showFileShell || isPaneAlive(FILES_TAB_KEY) ? (
          <div
            className="agent-inspector__pane"
            hidden={!showFileShell}
            inert={!showFileShell || undefined}
          >
            <FileShell
              currentTab={currentTab}
              showFileTree={showFileTree}
              onOpenFile={stableOpenFile}
              onNewFile={onNewFile}
              workspaceId={workspaceId ?? ""}
              onChanged={stableRefreshTree}
              drafts={drafts}
              mediaByKey={mediaByKey}
              readOnlyByPath={readOnlyByPath}
              onFileDraftChange={onFileDraftChange}
              onSaveFile={stableSaveFile}
              treeQuery={treeQuery}
              onTreeQueryChange={setTreeQuery}
              treeRoot={treeRoot}
              treeNodes={treeNodes}
              effectiveOpenDirs={effectiveOpenDirs}
              selectedPaths={selectedPaths}
              selectionJoins={selectionJoins}
              onTreeActivate={stableTreeActivate}
              treeCtxMenu={treeCtxMenu}
              onTreeCtxMenu={setTreeCtxMenu}
              copyPathText={copyPathText}
            />
          </div>
        ) : null}
      </div>

      <InspectorModals
        closeDirtyKey={closeDirtyKey}
        tabs={tabs}
        onCloseDirty={cancelDirtyClose}
        onDiscardAndClose={discardAndCloseDirty}
        onSaveAndClose={() => void saveAndCloseDirty()}
        saveAs={saveAs}
        onSaveAsChange={(next) => {
          setSaveAs(next);
          if (next === null) cancelDirtyClose();
        }}
        onCommitSaveAs={() => void commitSaveAs()}
      />
    </aside>
  );
});
