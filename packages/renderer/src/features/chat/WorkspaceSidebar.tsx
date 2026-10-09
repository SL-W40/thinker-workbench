/**
 * 左侧 Workspaces 侧栏：新建、悬停+/右键、重命名、拖拽排序、置顶、More。
 * 会话列表唯一来源：`agent:listThreads`（SQLite）。
 */
import {
  Button,
  ChevronRightIcon,
  ContextMenu,
  type ContextMenuItemProps,
  Field,
  FolderIcon,
  FolderPlusIcon,
  IconButton,
  Input,
  Modal,
  PlusIcon,
  SideNavItem,
} from "@thinker-workbench/design/react";
import type { ThreadMeta, WorkspaceRecord } from "@thinker-workbench/shared";
import { type DragEvent, useEffect, useMemo, useState } from "react";
import { pickDirectory } from "../../bridge/thinker";
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
} from "../../bridge/workspaces";
import { useT } from "../../i18n/I18nProvider";
import { formatRelativeTime } from "./formatRelativeTime";
import "./WorkspaceSidebar.less";

const MORE_LIMIT = 8;

/** 从绝对路径取文件夹名（跨平台分隔符）。 */
function folderBasename(rootPath: string): string {
  const cleaned = rootPath.replace(/[\\/]+$/, "");
  const parts = cleaned.split(/[/\\]/);
  return parts[parts.length - 1] || cleaned;
}

type Props = {
  activeSessionId: string | null;
  busy: boolean;
  onSelectSession: (sessionId: string, threadId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSessionCreated: (sessionId: string, threadId: string) => void;
  onSessionsMutated?: () => void;
};

type MenuState = {
  kind: "workspace" | "session";
  id: string;
  workspaceId?: string;
  anchor: { x: number; y: number };
};

type ConfirmState =
  | { kind: "delete-workspace"; id: string; name: string }
  | { kind: "clear-workspace"; id: string; name: string }
  | { kind: "session"; id: string; title: string }
  | null;

export function WorkspaceSidebar({
  activeSessionId,
  busy,
  onSelectSession,
  onSelectWorkspace,
  onSessionCreated,
  onSessionsMutated,
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

  async function refresh() {
    const [ws, th, collapsedIds] = await Promise.all([
      listWorkspaces(),
      listThreads(),
      getCollapsedWorkspaceIds(),
    ]);
    setWorkspaces(ws);
    setThreads(th);
    setCollapsed(new Set(collapsedIds));
  }

  useEffect(() => {
    void refresh();
    const u1 = onWorkspacesChanged(() => void refresh());
    const u2 = onThreadsChanged(() => void refresh());
    return () => {
      u1();
      u2();
    };
    // 挂载时订阅变更；refresh 闭包读最新 setState
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const grouped = useMemo(() => {
    return workspaces.map((w) => ({
      workspace: w,
      sessions: threads.filter((th) => th.workspaceId === w.id),
    }));
  }, [workspaces, threads]);

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

  function openRenameModal(sessionId: string, title: string) {
    setRenameEdit({ id: sessionId, draft: title });
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

  function openAliasModal(ws: WorkspaceRecord) {
    setAliasEdit({ id: ws.id, draft: ws.name });
  }

  async function commitAlias() {
    if (!aliasEdit) return;
    const { id, draft } = aliasEdit;
    setAliasEdit(null);
    await renameWorkspace(id, draft);
    await refresh();
  }

  function selectSession(sessionId: string, threadId: string) {
    if (busy && sessionId !== activeSessionId) {
      setToast(t("chat.busySwitchBlocked"));
      return;
    }
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
          onSelect: () => openAliasModal(ws),
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
                onSelect: () =>
                  setConfirm({ kind: "delete-workspace", id: ws.id, name: ws.name }),
              },
            ]),
      ];
    }
    const th = threads.find((x) => x.sessionId === menu.id);
    if (!th) return [];
    const isActiveBusy = busy && th.sessionId === activeSessionId;
    return [
      {
        label: t("workspaces.rename"),
        onSelect: () => openRenameModal(th.sessionId, th.title),
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
        label: t("workspaces.copyThreadId"),
        onSelect: () => void navigator.clipboard?.writeText(th.id),
      },
      {
        label: t("workspaces.deleteSession"),
        danger: true,
        separatorBefore: true,
        disabled: isActiveBusy,
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

      <div className="ws-sidebar__body">
        {grouped.length === 0 ? (
          <p className="ws-sidebar__empty">{t("workspaces.emptyTitle")}</p>
        ) : (
          grouped.map(({ workspace: w, sessions }) => {
            const isCollapsed = collapsed.has(w.id);
            const showAll = expandedMore.has(w.id);
            const visible = showAll ? sessions : sessions.slice(0, MORE_LIMIT);
            const hasMore = sessions.length > MORE_LIMIT;

            return (
              <div key={w.id} className="ws-workspace">
                <div
                  className={`ws-workspace__row${menu?.id === w.id ? " is-menu-open" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={!isCollapsed}
                  draggable
                  onDragStart={() => setDragWsId(w.id)}
                  onDragOver={(e: DragEvent) => e.preventDefault()}
                  onDrop={() => void onDropWorkspace(w.id)}
                  onClick={() => {
                    onSelectWorkspace(w.id);
                    toggleCollapsed(w.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectWorkspace(w.id);
                      toggleCollapsed(w.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({
                      kind: "workspace",
                      id: w.id,
                      anchor: { x: e.clientX, y: e.clientY },
                    });
                  }}
                >
                  {/* 同一槽位：默认文件夹，悬停换箭头，二者互斥 */}
                  <span className="ws-workspace__lead" aria-hidden>
                    <span className="ws-workspace__lead-icon ws-workspace__lead-icon--folder">
                      <FolderIcon size="md" open={!isCollapsed} />
                    </span>
                    <span className="ws-workspace__lead-icon ws-workspace__lead-icon--chevron">
                      <ChevronRightIcon open={!isCollapsed} size="sm" />
                    </span>
                  </span>
                  <span className="ws-workspace__name">{w.name}</span>
                  {w.pinned ? <span className="ws-workspace__pin">▴</span> : null}
                  <IconButton
                    aria-label={t("workspaces.newSession")}
                    size="sm"
                    className="ws-workspace__plus"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleNewSession(w.id);
                    }}
                  >
                    <PlusIcon />
                  </IconButton>
                </div>

                {/* 始终挂载，用 grid 行高过渡展开/收起，避免条件渲染硬切 */}
                <div
                  className={`ws-sessions${isCollapsed ? " is-collapsed" : " is-open"}`}
                  aria-hidden={isCollapsed}
                  inert={isCollapsed || undefined}
                >
                  <div className="ws-sessions__inner">
                    {sessions.length === 0 ? (
                      <p className="ws-hint">{t("workspaces.noSessions")}</p>
                    ) : (
                      visible.map((th) => (
                        <div
                          key={th.sessionId}
                          className={`ws-session${
                            th.sessionId === activeSessionId ? " is-selected" : ""
                          }`}
                          role="button"
                          tabIndex={0}
                          draggable
                          onDragStart={() =>
                            setDragSession({
                              sessionId: th.sessionId,
                              workspaceId: th.workspaceId,
                            })
                          }
                          onDragOver={(e: DragEvent) => e.preventDefault()}
                          onDrop={() => void onDropSession(th)}
                          onClick={() => selectSession(th.sessionId, th.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectSession(th.sessionId, th.id);
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setMenu({
                              kind: "session",
                              id: th.sessionId,
                              workspaceId: th.workspaceId,
                              anchor: { x: e.clientX, y: e.clientY },
                            });
                          }}
                        >
                          <span
                            className={`ws-session__dot${
                              th.runStatus === "interrupted"
                                ? " is-interrupted"
                                : th.runStatus === "running"
                                  ? " is-running"
                                  : ""
                            }`}
                          />
                          <span className="ws-session__title">{th.title}</span>
                          {th.pinned ? <span className="ws-session__pin">▴</span> : null}
                          <span className="ws-session__meta">
                            {formatRelativeTime(th.updatedAt, now)}
                          </span>
                        </div>
                      ))
                    )}
                    {hasMore ? (
                      <Button
                        className="ws-more"
                        variant="text"
                        size="sm"
                        onClick={() => {
                          const next = new Set(expandedMore);
                          if (next.has(w.id)) next.delete(w.id);
                          else next.add(w.id);
                          setExpandedMore(next);
                        }}
                      >
                        {showAll ? t("workspaces.less") : t("workspaces.more")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
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

      <Modal
        open={Boolean(renameEdit)}
        onClose={() => setRenameEdit(null)}
        closeOnBackdrop
        closeOnEscape
        aria-label={t("workspaces.renameTitle")}
      >
        <h2 className="components-modal-title">{t("workspaces.renameTitle")}</h2>
        {renameEdit ? (
          <Field label={t("workspaces.renameLabel")} htmlFor="ws-rename-input">
            <Input
              id="ws-rename-input"
              value={renameEdit.draft}
              autoFocus
              onChange={(e) => setRenameEdit({ ...renameEdit, draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitSessionRename();
              }}
            />
          </Field>
        ) : null}
        <div className="components-row components-row--end">
          <Button variant="ghost" onClick={() => setRenameEdit(null)}>
            {t("workspaces.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void commitSessionRename()}>
            {t("workspaces.renameSave")}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(aliasEdit)}
        onClose={() => setAliasEdit(null)}
        closeOnBackdrop
        closeOnEscape
        aria-label={t("workspaces.aliasTitle")}
      >
        <h2 className="components-modal-title">{t("workspaces.aliasTitle")}</h2>
        <p className="components-modal-body">{t("workspaces.aliasHint")}</p>
        {aliasEdit ? (
          <>
            <p className="ws-alias-modal__path">
              {t("workspaces.aliasFolder", {
                path: workspaces.find((w) => w.id === aliasEdit.id)?.rootPath ?? "",
              })}
            </p>
            <Field label={t("workspaces.aliasLabel")} htmlFor="ws-alias-input">
              <Input
                id="ws-alias-input"
                value={aliasEdit.draft}
                autoFocus
                placeholder={folderBasename(
                  workspaces.find((w) => w.id === aliasEdit.id)?.rootPath ?? "",
                )}
                onChange={(e) => setAliasEdit({ ...aliasEdit, draft: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitAlias();
                }}
              />
            </Field>
          </>
        ) : null}
        <div className="components-row components-row--end">
          <Button variant="ghost" onClick={() => setAliasEdit(null)}>
            {t("workspaces.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void commitAlias()}>
            {t("workspaces.aliasSave")}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        closeOnBackdrop
        closeOnEscape
        aria-label={
          confirm?.kind === "delete-workspace"
            ? t("workspaces.deleteWorkspaceTitle")
            : confirm?.kind === "clear-workspace"
              ? t("workspaces.clearWorkspaceTitle")
              : t("workspaces.deleteSessionTitle")
        }
      >
        <h2 className="components-modal-title">
          {confirm?.kind === "delete-workspace"
            ? t("workspaces.deleteWorkspaceTitle")
            : confirm?.kind === "clear-workspace"
              ? t("workspaces.clearWorkspaceTitle")
              : t("workspaces.deleteSessionTitle")}
        </h2>
        <p className="components-modal-body">
          {confirm?.kind === "delete-workspace"
            ? t("workspaces.deleteWorkspaceBody")
            : confirm?.kind === "clear-workspace"
              ? t("workspaces.clearWorkspaceBody")
              : t("workspaces.deleteSessionBody")}
        </p>
        <div className="components-row components-row--end">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            {t("workspaces.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const c = confirm;
              setConfirm(null);
              if (!c) return;
              void (async () => {
                if (c.kind === "delete-workspace") await removeWorkspace(c.id);
                else if (c.kind === "clear-workspace") await clearWorkspace(c.id);
                else await removeSession(c.id);
                // 主区由 useChatSession 监听 onThreadsChanged 做 reconcile
                await refresh();
                onSessionsMutated?.();
              })();
            }}
          >
            {confirm?.kind === "clear-workspace"
              ? t("workspaces.confirmClear")
              : t("workspaces.confirmDelete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
