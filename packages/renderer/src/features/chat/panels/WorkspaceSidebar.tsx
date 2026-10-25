/**
 * 左侧 Workspaces 侧栏（编排壳）：新建、悬停+/右键、重命名、拖拽排序、置顶、More。
 * 纯函数见 ./utils，工作区分组行见 ./rows，弹窗见 ./modals。
 */
import {
  ContextMenu,
  type ContextMenuItemProps,
  FolderPlusIcon,
  SideNavItem,
} from "@thinker-workbench/design/react";
import type { ThreadMeta, WorkspaceRecord } from "@thinker-workbench/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { pickDirectory } from "../../../platform/ipc/thinker";
import {
  clearWorkspace,
  createSession,
  createWorkspace,
  getCollapsedWorkspaceIds,
  listThreads,
  listWorkspaces,
  moveSession,
  onThreadsChanged,
  onWorkspacesChanged,
  removeSession,
  removeWorkspace,
  renameSession,
  renameWorkspace,
  reorderSessions,
  reorderWorkspaces,
  setCollapsedWorkspaceIds,
  setSessionPinned,
  setWorkspacePinned,
  showWorkspaceInFolder,
} from "../../../platform/ipc/workspaces";
import { useT } from "../../../ui/i18n/useI18n";
import "./WorkspaceSidebar.less";
import { type ConfirmState, SidebarModals } from "./modals";
import { WorkspaceGroup } from "./rows";
import { SidebarSearch } from "./SidebarSearch";
import { filterSidebarGroups, type SidebarGroup } from "./sidebarFilter";

type Props = {
  activeSessionId: string | null;
  busy: boolean;
  onSelectSession: (sessionId: string, threadId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSessionCreated: (sessionId: string, threadId: string) => void;
  onSessionsMutated?: () => void;
  /** 打开控制台 Trace 并聚焦该会话。 */
  onOpenTrace?: (sessionId: string) => void;
};

type MenuState = {
  kind: "workspace" | "session";
  id: string;
  workspaceId?: string;
  anchor: { x: number; y: number };
};

export function WorkspaceSidebar({
  activeSessionId,
  busy,
  onSelectSession,
  onSelectWorkspace,
  onSessionCreated,
  onSessionsMutated,
  onOpenTrace,
}: Props) {
  const t = useT();
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedMore, setExpandedMore] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  /** 会话重命名弹窗 */
  const [renameEdit, setRenameEdit] = useState<{ id: string; draft: string } | null>(null);
  /** 工作空间别名弹窗（不改磁盘目录） */
  const [aliasEdit, setAliasEdit] = useState<{ id: string; draft: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [dragWsId, setDragWsId] = useState<string | null>(null);
  const [dragSession, setDragSession] = useState<{
    sessionId: string;
    workspaceId: string;
  } | null>(null);
  /** 侧栏筛选关键词（本地过滤 + 全文检索共用同一个输入框）。 */
  const [filter, setFilter] = useState("");

  // 稳定引用：只读 import 与稳定 setState，挂载订阅 effect 依赖它
  const refresh = useCallback(async () => {
    const [ws, th, collapsedIds] = await Promise.all([
      listWorkspaces(),
      listThreads(),
      getCollapsedWorkspaceIds(),
    ]);
    setWorkspaces(ws);
    setThreads(th);
    setCollapsed(new Set(collapsedIds));
  }, []);

  useEffect(() => {
    void refresh();
    const u1 = onWorkspacesChanged(() => void refresh());
    const u2 = onThreadsChanged(() => void refresh());
    return () => {
      u1();
      u2();
    };
    // 挂载时订阅变更；refresh 闭包读取最新 setState
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  /** 原始分组：置顶优先，再按末条消息时间降序。 */
  const grouped = useMemo<SidebarGroup[]>(() => {
    return workspaces.map((w) => ({
      workspace: w,
      sessions: threads
        .filter((th) => th.workspaceId === w.id)
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.updatedAt - a.updatedAt;
        }),
    }));
  }, [workspaces, threads]);

  /** 检索中的分组（本地过滤；关键词为空时原样）。 */
  const visibleGroups = useMemo(() => filterSidebarGroups(grouped, filter), [grouped, filter]);

  /** 全文命中：跳到会话。命中哪条都先切会话，消息定位交由上层处理。 */
  function pickSearchHit(hit: { sessionId: string; threadId: string }) {
    selectSession(hit.sessionId, hit.threadId);
    setFilter("");
  }

  async function persistCollapsed(next: Set<string>) {
    setCollapsed(next);
    await setCollapsedWorkspaceIds([...next]);
  }

  function toggleCollapsed(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void persistCollapsed(next);
  }

  async function handleAddWorkspace() {
    const dir = await pickDirectory({ title: t("workspaces.pickDirectoryTitle") });
    if (!dir) return;
    const ws = await createWorkspace({ rootPath: dir });
    await refresh();
    // 打开后立即切到该工作空间（与门禁「打开」一致）
    onSelectWorkspace(ws.id);
    if (collapsed.has(ws.id)) {
      const next = new Set(collapsed);
      next.delete(ws.id);
      void persistCollapsed(next);
    }
  }

  async function handleNewSession(workspaceId: string) {
    const session = await createSession(workspaceId);
    onSessionCreated(session.id, session.threadId);
    onSessionsMutated?.();
    await refresh();
  }

  async function commitSessionRename() {
    if (!renameEdit) return;
    const { id, draft } = renameEdit;
    const name = draft.trim();
    setRenameEdit(null);
    if (!name) return;
    await renameSession(id, name);
    await refresh();
    onSessionsMutated?.();
  }

  async function commitAlias() {
    if (!aliasEdit) return;
    const { id, draft } = aliasEdit;
    setAliasEdit(null);
    await renameWorkspace(id, draft);
    await refresh();
  }

  function selectSession(sessionId: string, threadId: string) {
    // 忙碌时也允许点选：会话 hook 内会静默中断当前跑并重载，避免空态+转圈锁死
    onSelectSession(sessionId, threadId);
  }

  const menuItems: ContextMenuItemProps[] = (() => {
    if (!menu) return [];
    if (menu.kind === "workspace") {
      const ws = workspaces.find((w) => w.id === menu.id);
      if (!ws) return [];
      const isCollapsed = collapsed.has(ws.id);
      return [
        { label: t("workspaces.newSession"), onSelect: () => void handleNewSession(ws.id) },
        {
          label: t("workspaces.setAlias"),
          onSelect: () => setAliasEdit({ id: ws.id, draft: ws.name }),
        },
        {
          label: ws.pinned ? t("workspaces.unpin") : t("workspaces.pin"),
          onSelect: () => void setWorkspacePinned(ws.id, !ws.pinned).then(refresh),
        },
        {
          label: t("workspaces.showInFolder"),
          onSelect: () => void showWorkspaceInFolder(ws.id),
        },
        {
          label: isCollapsed ? t("workspaces.expand") : t("workspaces.collapse"),
          onSelect: () => toggleCollapsed(ws.id),
        },
        {
          label: t("workspaces.clearWorkspace"),
          danger: true,
          separatorBefore: true,
          onSelect: () => setConfirm({ kind: "clear-workspace", id: ws.id, name: ws.name }),
        },
        // 内置默认工作空间不可删除，仅可清空会话
        ...(ws.isDefault
          ? []
          : [
              {
                label: t("workspaces.deleteWorkspace"),
                danger: true,
                onSelect: () => setConfirm({ kind: "delete-workspace", id: ws.id, name: ws.name }),
              },
            ]),
      ];
    }
    const th = threads.find((x) => x.sessionId === menu.id);
    if (!th) return [];
    // 任意正在跑的会话都禁删（不仅当前会话 UI busy）
    const sessionBusy =
      th.runStatus === "running" ||
      th.runStatus === "queued" ||
      (busy && th.sessionId === activeSessionId);
    return [
      {
        label: t("workspaces.rename"),
        onSelect: () => setRenameEdit({ id: th.sessionId, draft: th.title }),
      },
      {
        label: th.pinned ? t("workspaces.unpin") : t("workspaces.pin"),
        onSelect: () => void setSessionPinned(th.sessionId, !th.pinned).then(refresh),
      },
      {
        label: t("workspaces.newSessionAbove"),
        onSelect: () => void handleNewSession(th.workspaceId),
      },
      {
        label: t("workspaces.copySessionId"),
        onSelect: () => void navigator.clipboard?.writeText(th.sessionId),
      },
      ...(onOpenTrace
        ? [
            {
              label: t("workspaces.openInTrace"),
              onSelect: () => onOpenTrace(th.sessionId),
            } satisfies ContextMenuItemProps,
          ]
        : []),
      {
        label: t("workspaces.deleteSession"),
        danger: true,
        separatorBefore: true,
        disabled: sessionBusy,
        onSelect: () => setConfirm({ kind: "session", id: th.sessionId, title: th.title }),
      },
    ];
  })();

  async function onDropWorkspace(targetId: string) {
    if (!dragWsId || dragWsId === targetId) {
      setDragWsId(null);
      return;
    }
    const ids = workspaces.map((w) => w.id);
    const from = ids.indexOf(dragWsId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragWsId(null);
      return;
    }
    ids.splice(from, 1);
    ids.splice(to, 0, dragWsId);
    setDragWsId(null);
    await reorderWorkspaces({ orderedIds: ids });
    await refresh();
  }

  async function onDropSession(target: ThreadMeta) {
    if (!dragSession) return;
    const { sessionId, workspaceId } = dragSession;
    setDragSession(null);
    if (workspaceId !== target.workspaceId) {
      await moveSession({ sessionId, workspaceId: target.workspaceId });
      await refresh();
      onSessionsMutated?.();
      return;
    }
    const ids = threads.filter((th) => th.workspaceId === workspaceId).map((th) => th.sessionId);
    const from = ids.indexOf(sessionId);
    const to = ids.indexOf(target.sessionId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, sessionId);
    await reorderSessions(workspaceId, { orderedIds: ids });
    await refresh();
  }

  function commitConfirm() {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    void (async () => {
      if (c.kind === "delete-workspace") await removeWorkspace(c.id);
      else if (c.kind === "clear-workspace") await clearWorkspace(c.id);
      else await removeSession(c.id);
      // 主区域 useChatSession 监听 onThreadsChanged 做 reconcile
      await refresh();
      onSessionsMutated?.();
    })();
  }

  return (
    <div className="ws-sidebar">
      <nav className="ws-sidebar__actions" aria-label={t("workspaces.title")}>
        <SideNavItem
          leading={<FolderPlusIcon size="md" />}
          onClick={() => void handleAddWorkspace()}
        >
          {t("workspaces.openWorkspace")}
        </SideNavItem>
      </nav>

      {workspaces.length > 0 ? (
        <div className="ws-sidebar__search">
          <SidebarSearch value={filter} onChange={setFilter} onPickHit={pickSearchHit} />
        </div>
      ) : null}

      <div className="ws-sidebar__body">
        {grouped.length === 0 ? (
          <p className="ws-sidebar__empty">{t("workspaces.emptyTitle")}</p>
        ) : visibleGroups.length === 0 ? (
          <p className="ws-sidebar__empty">{t("workspaces.filterNoMatch")}</p>
        ) : (
          visibleGroups.map(({ workspace: w, sessions }) => (
            <WorkspaceGroup
              key={w.id}
              workspace={w}
              sessions={sessions}
              // 筛选时强制展开，避免命中行被折叠状态藏起来
              isCollapsed={!filter && collapsed.has(w.id)}
              showAll={expandedMore.has(w.id)}
              menuOpen={menu?.id === w.id}
              activeSessionId={activeSessionId}
              busy={busy}
              now={now}
              onSelectWorkspace={onSelectWorkspace}
              onToggleCollapsed={toggleCollapsed}
              onNewSession={(id) => void handleNewSession(id)}
              onWorkspaceContextMenu={(e) =>
                setMenu({
                  kind: "workspace",
                  id: w.id,
                  anchor: { x: e.clientX, y: e.clientY },
                })
              }
              onWorkspaceDragStart={setDragWsId}
              onDropWorkspace={(id) => void onDropWorkspace(id)}
              onSessionDragStart={(th) =>
                setDragSession({ sessionId: th.sessionId, workspaceId: th.workspaceId })
              }
              onDropSession={(th) => void onDropSession(th)}
              onSelectSession={(th) => selectSession(th.sessionId, th.id)}
              onSessionContextMenu={(e, th) =>
                setMenu({
                  kind: "session",
                  id: th.sessionId,
                  workspaceId: th.workspaceId,
                  anchor: { x: e.clientX, y: e.clientY },
                })
              }
              onToggleMore={(id) => {
                const next = new Set(expandedMore);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setExpandedMore(next);
              }}
            />
          ))
        )}
      </div>

      {toast ? <div className="ws-toast">{toast}</div> : null}

      <ContextMenu
        open={Boolean(menu)}
        anchor={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        aria-label={t("workspaces.title")}
        items={menuItems}
      />

      <SidebarModals
        renameEdit={renameEdit}
        aliasEdit={aliasEdit}
        confirm={confirm}
        workspaces={workspaces}
        onRenameDraft={(draft) => setRenameEdit((prev) => (prev ? { ...prev, draft } : prev))}
        onCommitRename={() => void commitSessionRename()}
        onCloseRename={() => setRenameEdit(null)}
        onAliasDraft={(draft) => setAliasEdit((prev) => (prev ? { ...prev, draft } : prev))}
        onCommitAlias={() => void commitAlias()}
        onCloseAlias={() => setAliasEdit(null)}
        onConfirmCommit={commitConfirm}
        onCloseConfirm={() => setConfirm(null)}
      />
    </div>
  );
}
