/**
 * Composer 上方：agent 挂起的 background shell 任务条。
 * 默认折叠只显示标题；整行可悬停/点击展开收起（图标悬停时切箭头）；点任务打开终端。
 */
import { ChevronRightIcon, ConsoleIcon } from "@thinker-workbench/design/react";
import type { TerminalSession } from "@thinker-workbench/shared";
import { useEffect, useState } from "react";
import {
  listTerminalSessions,
  onTerminalEvent,
} from "../../bridge/terminal";
import { useT } from "../../i18n/I18nProvider";
import "./BackgroundTasksBar.less";

type Props = {
  onOpenTerminal?: (detail?: {
    sessionId?: string;
    previewOutput?: string;
    title?: string;
  }) => void;
};

/** 是否为仍存活的 background shell。 */
function isBackgroundTask(s: TerminalSession): boolean {
  if (!s.fromAgent || !s.backgrounded) return false;
  return s.status === "running" || s.status === "starting";
}

function taskLabel(s: TerminalSession): string {
  const cmd = s.command?.trim() || s.title?.trim() || s.sessionId.slice(0, 8);
  return cmd.length > 48 ? `${cmd.slice(0, 47)}…` : cmd;
}

export function BackgroundTasksBar({ onOpenTerminal }: Props) {
  const t = useT();
  const [tasks, setTasks] = useState<TerminalSession[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listTerminalSessions().then((list) => {
      if (!cancelled) setTasks(list.filter(isBackgroundTask));
    });
    const unsub = onTerminalEvent((event) => {
      if (event.type === "created" || event.type === "updated") {
        const session = event.session;
        setTasks((prev) => {
          const without = prev.filter((s) => s.sessionId !== session.sessionId);
          if (!isBackgroundTask(session)) return without;
          return [...without, session];
        });
        return;
      }
      if (event.type === "exit") {
        setTasks((prev) => prev.filter((s) => s.sessionId !== event.sessionId));
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (tasks.length === 0) setExpanded(false);
  }, [tasks.length]);

  if (tasks.length === 0 || !onOpenTerminal) return null;

  return (
    <div
      className={`bg-tasks${expanded ? " is-expanded" : ""}`}
      aria-label={t("chat.backgroundTasks.label")}
    >
      <button
        type="button"
        className="bg-tasks__head"
        aria-expanded={expanded}
        aria-label={
          expanded ? t("chat.backgroundTasks.collapse") : t("chat.backgroundTasks.expandAll")
        }
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="bg-tasks__icon" aria-hidden="true">
          <ConsoleIcon size="sm" className="bg-tasks__ico bg-tasks__ico--console" />
          <ChevronRightIcon
            size="sm"
            open={expanded}
            className="bg-tasks__ico bg-tasks__ico--arrow"
          />
        </span>
        <span className="bg-tasks__title">
          {t("chat.backgroundTasks.title", { n: String(tasks.length) })}
        </span>
      </button>
      {expanded ? (
        <ul className="bg-tasks__list">
          {tasks.map((s) => (
            <li key={s.sessionId}>
              <button
                type="button"
                className="bg-tasks__chip"
                onClick={() =>
                  onOpenTerminal({
                    sessionId: s.sessionId,
                    title: s.command?.trim() || s.title,
                  })
                }
              >
                <span className="bg-tasks__dot" aria-hidden="true" />
                <span className="bg-tasks__cmd">{taskLabel(s)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
