/**
 * Composer 上方：agent 挂起的 background shell 任务条。
 */
import { ChevronRightIcon, ConsoleIcon } from "@thinker-workbench/design/react";
import type { TerminalSession } from "@thinker-workbench/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { requestOpenSubagent } from "../../bridge/subagent";
import { onAgentEvent } from "../../bridge/thinker";
import {
  listTerminalSessions,
  onTerminalEvent,
} from "../../bridge/terminal";
import { useT } from "../../i18n/useI18n";
import "./BackgroundTasksBar.less";

type Props = {
  onOpenTerminal?: (detail?: {
    sessionId?: string;
    previewOutput?: string;
    title?: string;
  }) => void;
};

type SubagentTask = {
  taskId: string;
  subagent: string;
  title?: string;
  summary?: string;
  liveLine?: string;
};

/** 是否为仍存活的 background shell*/
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
  const [shellTasks, setShellTasks] = useState<TerminalSession[]>([]);
  const [subagents, setSubagents] = useState<SubagentTask[]>([]);
  const [expanded, setExpanded] = useState(false);
 /** 已收束的 taskId：忽略迟到的 progress，避免停止后仍占后台条*/
  const settledTaskIds = useRef(new Set<string>());
  const subagentsRef = useRef<SubagentTask[]>([]);
  subagentsRef.current = subagents;

  useEffect(() => {
    let cancelled = false;
    void listTerminalSessions().then((list) => {
      if (!cancelled) setShellTasks(list.filter(isBackgroundTask));
    });
    const unsub = onTerminalEvent((event) => {
      if (event.type === "created" || event.type === "updated") {
        const session = event.session;
        setShellTasks((prev) => {
          const without = prev.filter((s) => s.sessionId !== session.sessionId);
          if (!isBackgroundTask(session)) return without;
          return [...without, session];
        });
        return;
      }
      if (event.type === "exit") {
        setShellTasks((prev) => prev.filter((s) => s.sessionId !== event.sessionId));
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    const settled = settledTaskIds.current;
    return onAgentEvent((event) => {
 // 手动取消：清空全部子代理条（含仅流式预告、尚未写入 engine Map 的）
 // 注意：正常 done 时后台 Task 应继续，不能在此清空
      if (
        event.type === "error" &&
        /cancel/i.test(event.error || "")
      ) {
        for (const s of subagentsRef.current) settled.add(s.taskId);
        setSubagents([]);
        return;
      }
      if (event.type !== "subagent" || !event.background) return;
      if (
        event.phase === "finished" ||
        event.phase === "failed" ||
        event.phase === "cancelled"
      ) {
        settled.add(event.taskId);
        setSubagents((prev) => prev.filter((t) => t.taskId !== event.taskId));
        return;
      }
      if (event.phase === "started" || event.phase === "progress") {
        if (settled.has(event.taskId)) return;
        setSubagents((prev) => {
          const prior = prev.find((t) => t.taskId === event.taskId);
          const without = prev.filter((t) => t.taskId !== event.taskId);
          return [
            ...without,
            {
              taskId: event.taskId,
              subagent: event.subagent,
              title: event.title?.trim() || prior?.title,
              summary: event.summary,
              liveLine: event.liveLine,
            },
          ];
        });
      }
    });
  }, []);

  const total = shellTasks.length + subagents.length;

  useEffect(() => {
    if (total === 0) setExpanded(false);
  }, [total]);

  const title = useMemo(
    () => t("chat.backgroundTasks.title", { n: String(total) }),
    [t, total],
  );

  if (total === 0) return null;

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
        <span className="bg-tasks__title">{title}</span>
      </button>
      {expanded ? (
        <ul className="bg-tasks__list">
          {shellTasks.map((s) => (
            <li key={s.sessionId}>
              <button
                type="button"
                className="bg-tasks__chip"
                disabled={!onOpenTerminal}
                onClick={() =>
                  onOpenTerminal?.({
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
          {subagents.map((s) => {
            const typeName =
              !s.subagent.trim() || s.subagent === "…"
                ? t("chat.subagent.pendingName")
                : s.subagent;
            const label = s.title?.trim() || typeName;
            return (
            <li key={s.taskId}>
              <button
                type="button"
                className="bg-tasks__chip"
                aria-label={t("chat.subagent.openTimeline", { name: label })}
                onClick={() =>
                  requestOpenSubagent({
                    id: s.taskId,
                    kind: "subagent",
                    taskId: s.taskId,
                    subagent: s.subagent === "…" ? typeName : s.subagent,
                    title: s.title,
                    phase: "progress",
                    liveLine: s.liveLine,
                    summary: s.summary,
                    background: true,
                    active: true,
                  })
                }
              >
                <span className="bg-tasks__dot" aria-hidden="true" />
                <span className="bg-tasks__cmd">
                  {s.liveLine?.trim()
                    ? `${label} · ${s.liveLine.trim()}`
                    : t("chat.subagent.bgChip", { name: label })}
                </span>
              </button>
            </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
