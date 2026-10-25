/**
 * Composer 上方：agent 挂起的 background shell / subagent 任务条。
 * Subagent 芯片旁可取消单路 Task（与 task_cancel 同一 IPC 执法点）。
 */
import { ChevronRightIcon, EyeIcon, IconButton, StopIcon } from "@thinker-workbench/design/react";
import type { TerminalSession } from "@thinker-workbench/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { requestOpenSubagent } from "../../../platform/ipc/subagent";
import {
  killTerminal,
  listTerminalSessions,
  onTerminalEvent,
} from "../../../platform/ipc/terminal";
import { cancelAgentTask, onAgentEvent } from "../../../platform/ipc/thinker";
import { useT } from "../../../ui/i18n/useI18n";
import "./BackgroundTasksBar.less";

type Props = {
  /** 当前聊天 thread；有则只展示本会话的 subagent（shell 仍按全局 backgrounded） */
  threadId?: string;
  /** 当前 runId；取消 Task 时用于归属校验（可选）。 */
  runId?: string;
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

export function BackgroundTasksBar({ threadId, runId, onOpenTerminal }: Props) {
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
    const matchThread = (s: TerminalSession) => !threadId || !s.threadId || s.threadId === threadId;
    void listTerminalSessions().then((list) => {
      if (!cancelled) {
        setShellTasks(list.filter((s) => isBackgroundTask(s) && matchThread(s)));
      }
    });
    /** 比较两个 session 是否在展示层面等价，避免无谓的重渲染 */
    const sessionsEqual = (a: TerminalSession, b: TerminalSession): boolean =>
      a.sessionId === b.sessionId &&
      a.status === b.status &&
      a.command === b.command &&
      a.title === b.title &&
      a.backgrounded === b.backgrounded;

    const unsub = onTerminalEvent((event) => {
      if (
        event.type === "created" ||
        event.type === "updated" ||
        event.type === "commandBackgrounded"
      ) {
        const session = event.session;
        const keep = isBackgroundTask(session) && matchThread(session);
        setShellTasks((prev) => {
          const idx = prev.findIndex((s) => s.sessionId === session.sessionId);
          if (!keep) {
            if (idx === -1) return prev;
            const next = prev.slice();
            next.splice(idx, 1);
            return next;
          }
          if (idx !== -1 && sessionsEqual(prev[idx], session)) return prev;
          if (idx !== -1) {
            // 就地替换，保持顺序稳定
            const next = prev.slice();
            next[idx] = session;
            return next;
          }
          // 新任务追加到末尾
          return [...prev, session];
        });
        return;
      }
      if (event.type === "exit" || event.type === "commandExited") {
        setShellTasks((prev) => {
          const idx = prev.findIndex((s) => s.sessionId === event.sessionId);
          if (idx === -1) return prev;
          const next = prev.slice();
          next.splice(idx, 1);
          return next;
        });
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [threadId]);

  useEffect(() => {
    const settled = settledTaskIds.current;
    return onAgentEvent((event) => {
      // 手动取消：仅清当前 thread 相关（无 threadId 时全清）
      if (event.type === "error" && /cancel/i.test(event.error || "")) {
        if (threadId && event.threadId && event.threadId !== threadId) return;
        for (const s of subagentsRef.current) settled.add(s.taskId);
        setSubagents([]);
        return;
      }
      if (event.type !== "subagent" || !event.background) return;
      if (threadId && event.threadId && event.threadId !== threadId) return;
      if (event.phase === "finished" || event.phase === "failed" || event.phase === "cancelled") {
        settled.add(event.taskId);
        setSubagents((prev) => {
          const idx = prev.findIndex((t) => t.taskId === event.taskId);
          if (idx === -1) return prev;
          const next = prev.slice();
          next.splice(idx, 1);
          return next;
        });
        return;
      }
      if (event.phase === "started" || event.phase === "progress") {
        if (settled.has(event.taskId)) return;
        setSubagents((prev) => {
          const idx = prev.findIndex((t) => t.taskId === event.taskId);
          const prior = idx !== -1 ? prev[idx] : undefined;
          const title = event.title?.trim() || prior?.title;
          const summary = event.summary ?? prior?.summary;
          // 后台条只展示静态标题；progress 的 liveLine 不写入，避免刷屏
          if (
            prior &&
            prior.subagent === event.subagent &&
            prior.title === title &&
            prior.summary === summary
          ) {
            return prev;
          }
          if (idx !== -1) {
            // 就地替换，保持顺序稳定
            const next = prev.slice();
            next[idx] = {
              taskId: event.taskId,
              subagent: event.subagent,
              title,
              summary,
            };
            return next;
          }
          // 新任务追加到末尾
          return [
            ...prev,
            {
              taskId: event.taskId,
              subagent: event.subagent,
              title,
              summary,
            },
          ];
        });
      }
    });
  }, [threadId]);

  const total = shellTasks.length + subagents.length;

  useEffect(() => {
    if (total === 0) setExpanded(false);
  }, [total]);

  const title = useMemo(() => t("chat.backgroundTasks.title", { n: String(total) }), [t, total]);

  if (total === 0) return null;

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: 容器仅作命名区域，交互由内部带 role 的按钮承担
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
          <ChevronRightIcon size="sm" open={expanded} />
        </span>
        <span className="bg-tasks__title">{title}</span>
      </button>
      {expanded ? (
        <ul className="bg-tasks__list">
          {shellTasks.map((s) => {
            const label = taskLabel(s);
            return (
              <li key={s.sessionId} className="bg-tasks__row">
                <span className="bg-tasks__cmd" title={label}>
                  <span className="bg-tasks__dot" aria-hidden="true" />
                  <span className="bg-tasks__text">{label}</span>
                </span>
                {/* 悬停才露头：查看进终端，停止杀掉这条后台 shell */}
                <span className="bg-tasks__ops">
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!onOpenTerminal}
                    aria-label={t("chat.backgroundTasks.openTaskNamed", { name: label })}
                    onClick={() =>
                      onOpenTerminal?.({
                        sessionId: s.sessionId,
                        title: s.command?.trim() || s.title,
                      })
                    }
                  >
                    <EyeIcon size="sm" />
                  </IconButton>
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("chat.backgroundTasks.stopTaskNamed", { name: label })}
                    onClick={() => {
                      void killTerminal(s.sessionId).catch((err) =>
                        console.error("killTerminal failed", err),
                      );
                    }}
                  >
                    <StopIcon size="sm" />
                  </IconButton>
                </span>
              </li>
            );
          })}
          {subagents.map((s) => {
            const typeName =
              !s.subagent.trim() || s.subagent === "…"
                ? t("chat.subagent.pendingName")
                : s.subagent;
            const label = s.title?.trim() || typeName;
            return (
              <li key={s.taskId} className="bg-tasks__row">
                <span className="bg-tasks__cmd" title={label}>
                  <span className="bg-tasks__dot" aria-hidden="true" />
                  <span className="bg-tasks__text">{label}</span>
                </span>
                {/* 悬停才露头：查看开子代理时间线，停止走 cancelAgentTask */}
                <span className="bg-tasks__ops">
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("chat.backgroundTasks.openTaskNamed", { name: label })}
                    onClick={() =>
                      requestOpenSubagent({
                        id: s.taskId,
                        kind: "subagent",
                        taskId: s.taskId,
                        subagent: s.subagent === "…" ? typeName : s.subagent,
                        title: s.title,
                        phase: "progress",
                        summary: s.summary,
                        background: true,
                        active: true,
                      })
                    }
                  >
                    <EyeIcon size="sm" />
                  </IconButton>
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("chat.backgroundTasks.stopTaskNamed", { name: label })}
                    onClick={() => void cancelAgentTask(s.taskId, runId)}
                  >
                    <StopIcon size="sm" />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
