/**
 * 右侧 Terminal 面板（编排壳）：xterm 主区 + 右侧会话列表（类 VS Code）。
 * xterm 生命周期见 ./useTerminalHost，默认壳解析见 ./profile，列表与空态见 ./SessionList / ./TerminalEmpty。
 */
import { useDesignTheme } from "@thinker-workbench/design/react";
import type { ShellProfile, TerminalSession } from "@thinker-workbench/shared";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  consumePendingOpenTerminal,
  createTerminal,
  getTerminalOutput,
  killTerminal,
  listShellProfiles,
  listTerminalSessions,
  OPEN_TERMINAL_EVENT,
  type OpenTerminalDetail,
  onTerminalEvent,
  resizeTerminal,
} from "../../../bridge/terminal";
import { useT } from "../../../i18n/useI18n";
import "../TerminalPane.less";
import { resolveDefaultProfile } from "./profile";
import { SessionList } from "./SessionList";
import { TerminalEmpty } from "./TerminalEmpty";
import { useTerminalHost } from "./useTerminalHost";

type Props = {
  /** 面板是否可见（不可见时跳过 fit，显示时补一次）。*/
  active?: boolean;
  /** 外部请求聚焦的会话 id。*/
  focusSessionId?: string | null;
  onFocusSessionConsumed?: () => void;
};

export function TerminalPane({
  active = true,
  focusSessionId = null,
  onFocusSessionConsumed,
}: Props) {
  const t = useT();
  const { theme } = useDesignTheme();

  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [shellProfiles, setShellProfiles] = useState<ShellProfile[]>([]);
  const buffersRef = useRef(new Map<string, string>());
  /** 避免切换会话时旧 getOutput 覆盖新会话。*/
  const loadSeqRef = useRef(0);

  const {
    hostRef,
    termRef,
    fitRef,
    activeIdRef,
    sessionsRef,
    clearPendingWrite,
    scheduleTermWrite,
  } = useTerminalHost(theme, active);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId, activeIdRef]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions, sessionsRef]);

  // 加载本机 shell profiles（新建下拉）
  useEffect(() => {
    let cancelled = false;
    void listShellProfiles().then((list) => {
      if (!cancelled) setShellProfiles(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 加载会话列表 + 订阅事件
  useEffect(() => {
    let cancelled = false;
    void listTerminalSessions().then((list) => {
      if (cancelled) return;
      setSessions(list);
      if (!activeIdRef.current && list.length > 0) {
        setActiveId(list[list.length - 1]?.sessionId);
      }
    });

    const unsub = onTerminalEvent((event) => {
      if (event.type === "created") {
        if (!buffersRef.current.has(event.session.sessionId)) {
          buffersRef.current.set(event.session.sessionId, "");
        }
        setSessions((prev) => {
          const without = prev.filter((s) => s.sessionId !== event.session.sessionId);
          return [...without, event.session];
        });
        return;
      }
      if (event.type === "updated" || event.type === "exit") {
        const session = event.session;
        setSessions((prev) => {
          const idx = prev.findIndex((s) => s.sessionId === session.sessionId);
          // 用户已从列表关掉的会话不要被 exit/updated 复活（否则要点两次关闭）
          if (idx < 0) return prev;
          return prev.map((s) => (s.sessionId === session.sessionId ? session : s));
        });
        return;
      }
      if (event.type === "data") {
        const prev = buffersRef.current.get(event.sessionId) ?? "";
        buffersRef.current.set(event.sessionId, prev + event.data);
        if (activeIdRef.current === event.sessionId) {
          scheduleTermWrite(event.sessionId, event.data);
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
      clearPendingWrite();
    };
    // scheduleTermWrite / clearPendingWrite 稳定于闭包外的 ref
  }, [clearPendingWrite, scheduleTermWrite, activeIdRef]);

  // 切换会话：清屏，优先本地缓冲，否则从主进程拉
  useEffect(() => {
    const term = termRef.current;
    if (!term || !activeId) return;
    const seq = ++loadSeqRef.current;
    // 缓冲已含未刷写内容；丢弃 pending，避免写到错误会话
    clearPendingWrite();
    term.reset();
    const local = buffersRef.current.get(activeId) ?? "";
    if (local) term.write(local);

    void getTerminalOutput(activeId).then((remote) => {
      if (loadSeqRef.current !== seq || activeIdRef.current !== activeId) return;
      if (!remote) return;
      const cur = buffersRef.current.get(activeId) ?? "";
      // 主进程缓冲更完整时整段替换并重绘
      if (remote.length >= cur.length && remote !== cur) {
        buffersRef.current.set(activeId, remote);
        term.reset();
        term.write(remote);
      } else if (!cur && remote) {
        buffersRef.current.set(activeId, remote);
        term.write(remote);
      }
    });

    try {
      fitRef.current?.fit();
      void resizeTerminal(activeId, term.cols, term.rows);
    } catch {
      /* ignore */
    }
  }, [activeId, clearPendingWrite, termRef, fitRef, activeIdRef]);

  // 稳定引用：多个订阅 effect 依赖它，避免每渲染重绑
  const focusSession = useCallback(
    (detail: OpenTerminalDetail) => {
      const id = detail.sessionId?.trim();
      if (id) {
        // 有真实 sessionId 时以主进程缓冲为准，不用时间线截断预览覆盖
        setSessions((prev) => {
          if (prev.some((s) => s.sessionId === id)) return prev;
          return [
            ...prev,
            {
              sessionId: id,
              title: detail.title?.trim() || id.slice(0, 8),
              cwd: "",
              cols: 120,
              rows: 30,
              status: "running",
              fromAgent: true,
              createdAt: Date.now(),
            },
          ];
        });
        setActiveId(id);
        // 立刻拉全量滚动区，避免只看到时间线里那一小段
        void getTerminalOutput(id).then((remote) => {
          if (!remote) return;
          buffersRef.current.set(id, remote);
          if (activeIdRef.current === id && termRef.current) {
            termRef.current.reset();
            termRef.current.write(remote);
          }
        });
        return;
      }
      // ?sessionId：用预览造本地只读会
      if (detail.previewOutput?.trim()) {
        const ghostId = `preview:${Date.now()}`;
        buffersRef.current.set(ghostId, detail.previewOutput);
        setSessions((prev) => [
          ...prev,
          {
            sessionId: ghostId,
            title: detail.title?.trim() || t("terminal.fromAgent"),
            cwd: "",
            cols: 120,
            rows: 30,
            status: "exited",
            fromAgent: true,
            createdAt: Date.now(),
          },
        ]);
        setActiveId(ghostId);
      }
    },
    [t, activeIdRef, termRef],
  );

  // 挂载时消费跳转前暂存的打开请求（面板此前未挂载会漏掉事件）
  useEffect(() => {
    const pending = consumePendingOpenTerminal();
    if (pending) focusSession(pending);
  }, [focusSession]);

  // 外部聚焦
  useEffect(() => {
    if (!focusSessionId) return;
    focusSession({ sessionId: focusSessionId });
    onFocusSessionConsumed?.();
  }, [focusSessionId, onFocusSessionConsumed, focusSession]);

  // 全局「打开终端」事件（面板已挂载时：
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<OpenTerminalDetail>).detail ?? {};
      // 事件已派发则清空 pending，避免 mount 消费重复
      consumePendingOpenTerminal();
      focusSession(detail);
    }
    window.addEventListener(OPEN_TERMINAL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TERMINAL_EVENT, onOpen);
  }, [focusSession]);

  async function onNew(profileId?: string) {
    if (creating) return;
    setCreating(true);
    try {
      const session = await createTerminal(profileId ? { profileId } : undefined);
      if (session) {
        setSessions((prev) => {
          if (prev.some((s) => s.sessionId === session.sessionId)) return prev;
          return [...prev, session];
        });
        setActiveId(session.sessionId);
      }
    } finally {
      setCreating(false);
    }
  }

  async function onKill(sessionId: string) {
    // 先本地移除，避免 kill ?exit 事件把会话又写回列表
    const wasActive = activeIdRef.current === sessionId;
    buffersRef.current.delete(sessionId);
    setSessions((prev) => {
      const next = prev.filter((s) => s.sessionId !== sessionId);
      setActiveId((cur) => {
        if (cur !== sessionId) return cur;
        return next[next.length - 1]?.sessionId ?? null;
      });
      return next;
    });
    if (wasActive) termRef.current?.reset();
    if (!sessionId.startsWith("preview:")) {
      await killTerminal(sessionId);
    }
  }

  const available = Boolean(window.thinker?.terminal);
  const hasSessions = sessions.length > 0;
  const activeSession = sessions.find((s) => s.sessionId === activeId) ?? null;
  const activeTitle =
    activeSession?.title?.trim() ||
    activeSession?.sessionId.slice(0, 8) ||
    t("inspector.section.terminal");
  const activeOrigin = activeSession
    ? activeSession.fromAgent
      ? t("terminal.fromAgent")
      : t("terminal.fromUser")
    : null;
  const shellProfileId = window.thinker?.settings?.getGeneralSync?.()?.shellProfileId ?? "default";
  const defaultProfile = resolveDefaultProfile(shellProfiles, shellProfileId);
  const showEmpty = !activeId;

  if (!available) {
    return (
      <TerminalEmpty
        full
        title={t("inspector.unavailableTitle")}
        description={t("inspector.unavailableBody", { cmd: "pnpm run dev" })}
      />
    );
  }

  return (
    <div className={`terminal-pane${showEmpty && !hasSessions ? " terminal-pane--empty" : ""}`}>
      <div className="terminal-pane__main">
        {hasSessions ? (
          <div className="terminal-pane__toolbar">
            <span className="terminal-pane__title" title={activeTitle}>
              {activeTitle}
            </span>
            {activeOrigin ? (
              <span
                className={`terminal-pane__origin${
                  activeSession?.fromAgent ? " is-ai" : " is-user"
                }`}
              >
                {activeOrigin}
              </span>
            ) : null}
          </div>
        ) : null}
        {/* xterm 宿主需常挂，避免空态时销毁实例 */}
        <div ref={hostRef} className="terminal-pane__xterm" hidden={showEmpty} />
        {showEmpty ? (
          <TerminalEmpty
            title={t("terminal.emptyTitle")}
            description={t("terminal.emptyBody")}
            action={{
              label: t("terminal.new"),
              disabled: creating,
              onClick: () => void onNew(),
            }}
          />
        ) : null}
      </div>
      <SessionList
        sessions={sessions}
        activeId={activeId}
        creating={creating}
        shellProfiles={shellProfiles}
        defaultProfile={defaultProfile}
        onSelect={setActiveId}
        onNew={(profileId) => void onNew(profileId)}
        onKill={(sessionId) => void onKill(sessionId)}
      />
    </div>
  );
}
