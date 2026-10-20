/**
 * 工作区分组行：标题行（折叠 / 拖拽 / 右键）+ 常挂的会话列表（More 展开）。
 */
import {
  Button,
  ChevronRightIcon,
  FolderIcon,
  IconButton,
  PlusIcon,
} from "@thinker-workbench/design/react";
import type { ThreadMeta, WorkspaceRecord } from "@thinker-workbench/shared";
import type { DragEvent } from "react";
import { useT } from "../../../i18n/useI18n";
import { formatRelativeTime } from "../formatRelativeTime";
import { MORE_LIMIT } from "./utils";

type Props = {
  workspace: WorkspaceRecord;
  sessions: ThreadMeta[];
  isCollapsed: boolean;
  showAll: boolean;
  /** 右键菜单正对本工作区行打开。 */
  menuOpen: boolean;
  activeSessionId: string | null;
  busy: boolean;
  now: number;
  onSelectWorkspace: (workspaceId: string) => void;
  onToggleCollapsed: (workspaceId: string) => void;
  onNewSession: (workspaceId: string) => void;
  onWorkspaceContextMenu: (e: {
    preventDefault: () => void;
    clientX: number;
    clientY: number;
  }) => void;
  onWorkspaceDragStart: (workspaceId: string) => void;
  onDropWorkspace: (workspaceId: string) => void;
  onSessionDragStart: (th: ThreadMeta) => void;
  onDropSession: (th: ThreadMeta) => void;
  onSelectSession: (th: ThreadMeta) => void;
  onSessionContextMenu: (
    e: { preventDefault: () => void; clientX: number; clientY: number },
    th: ThreadMeta,
  ) => void;
  onToggleMore: (workspaceId: string) => void;
};

export function WorkspaceGroup({
  workspace: w,
  sessions,
  isCollapsed,
  showAll,
  menuOpen,
  activeSessionId,
  busy,
  now,
  onSelectWorkspace,
  onToggleCollapsed,
  onNewSession,
  onWorkspaceContextMenu,
  onWorkspaceDragStart,
  onDropWorkspace,
  onSessionDragStart,
  onDropSession,
  onSelectSession,
  onSessionContextMenu,
  onToggleMore,
}: Props) {
  const t = useT();
  const visible = showAll ? sessions : sessions.slice(0, MORE_LIMIT);
  const hasMore = sessions.length > MORE_LIMIT;

  return (
    <div className="ws-workspace">
      {/* biome-ignore lint/a11y/useSemanticElements: 工作区行承担折叠 / 拖拽 / 右键菜单多职责，包原生 button 会破坏内部布局 */}
      <div
        className={`ws-workspace__row${menuOpen ? " is-menu-open" : ""}`}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        draggable
        onDragStart={() => onWorkspaceDragStart(w.id)}
        onDragOver={(e: DragEvent) => e.preventDefault()}
        onDrop={() => onDropWorkspace(w.id)}
        onClick={() => {
          onSelectWorkspace(w.id);
          onToggleCollapsed(w.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectWorkspace(w.id);
            onToggleCollapsed(w.id);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onWorkspaceContextMenu(e);
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
        {w.pinned ? (
          <span className="ws-workspace__pin" aria-hidden>
            📌
          </span>
        ) : null}
        <IconButton
          aria-label={t("workspaces.newSession")}
          size="sm"
          className="ws-workspace__plus"
          onClick={(e) => {
            e.stopPropagation();
            onNewSession(w.id);
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
              // biome-ignore lint/a11y/useSemanticElements: 会话行承担选中 / 拖拽 / 右键菜单多职责，包原生 button 会破坏内部布局
              <div
                key={th.sessionId}
                className={`ws-session${th.sessionId === activeSessionId ? " is-selected" : ""}`}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={() => onSessionDragStart(th)}
                onDragOver={(e: DragEvent) => e.preventDefault()}
                onDrop={() => onDropSession(th)}
                onClick={() => onSelectSession(th)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectSession(th);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onSessionContextMenu(e, th);
                }}
              >
                <span
                  className={`ws-session__dot${
                    th.runStatus === "cancelled" || th.runStatus === "crashed"
                      ? " is-interrupted"
                      : th.runStatus === "queued"
                        ? " is-queued"
                        : th.runStatus === "running" || (busy && th.sessionId === activeSessionId)
                          ? " is-running"
                          : ""
                  }`}
                  title={
                    th.runStatus === "queued"
                      ? th.queuePosition
                        ? t("chat.queued", { position: String(th.queuePosition) })
                        : t("chat.queuedUnknown")
                      : undefined
                  }
                />
                <span className="ws-session__title">{th.title}</span>
                {th.pinned ? (
                  <span className="ws-session__pin" aria-hidden>
                    📌
                  </span>
                ) : null}
                <span className="ws-session__meta">{formatRelativeTime(th.updatedAt, now)}</span>
              </div>
            ))
          )}
          {hasMore ? (
            <Button
              className="ws-more"
              variant="ghost"
              size="sm"
              endIcon={<ChevronRightIcon open={showAll} size="sm" />}
              onClick={() => onToggleMore(w.id)}
            >
              {showAll ? t("workspaces.less") : t("workspaces.more")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
