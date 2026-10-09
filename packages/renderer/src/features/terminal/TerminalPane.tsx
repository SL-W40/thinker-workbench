/**
 * 右侧 Terminal 面板：xterm 主区 + 右侧会话列表（类 VS Code）。
 */
import {
  Button,
  ChevronRightIcon,
  CloseIcon,
  ConsoleIcon,
  ContextMenu,
  EmptyState,
  IconButton,
  PlusIcon,
  useDesignTheme,
} from "@thinker-workbench/design/react";
import type { ShellProfile, TerminalSession } from "@thinker-workbench/shared";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import {
  consumePendingOpenTerminal,
  createTerminal,
  getTerminalOutput,
  killTerminal,
  listShellProfiles,
  listTerminalSessions,
  onTerminalEvent,
  OPEN_TERMINAL_EVENT,
  type OpenTerminalDetail,
  resizeTerminal,
  writeTerminal,
} from "../../bridge/terminal";
import { useT } from "../../i18n/I18nProvider";
import "./TerminalPane.less";
import { applyTerminalHostColors, readXtermTheme } from "./xtermTheme";

/** 解析 Settings 默认壳；`default` 时与主进程平台默认启发式一致。 */
function resolveDefaultProfile(
  profiles: ShellProfile[],
  shellProfileId: string | undefined,
): ShellProfile | null {
  if (profiles.length === 0) return null;
  const id = (shellProfileId ?? "default").trim() || "default";
  if (id !== "default") {
    return profiles.find((p) => p.id === id) ?? profiles[0]!;
  }
  return (
    profiles.find((p) => p.id === "powershell") ||
    profiles.find((p) => p.id === "shell") ||
    profiles[0]!
  );
}

type Props = {
  /** 面板是否可见（不可见时跳过 fit，显示时补一次）。 */
  active?: boolean;
  /** 外部请求聚焦的会话 id。 */
  focusSessionId?: string | null;
  onFocusSessionConsumed?: () => void;
};

export function TerminalPane({
  active = true,
  focusSessionId = null,
  onFocusSessionConsumed,
}: Props) {
  const t = useT();
  const { theme, themeId } = useDesignTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<TerminalSession[]>([]);
  const buffersRef = useRef(new Map<string, string>());
  /** 避免切换会话时旧 getOutput 覆盖新会话。 */
  const loadSeqRef = useRef(0);

  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [shellProfiles, setShellProfiles] = useState<ShellProfile[]>([]);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newMenuAnchor, setNewMenuAnchor] = useState<DOMRect | null>(null);
  const newSplitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // 初始化 xterm
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      theme: readXtermTheme(theme),
      allowTransparency: false,
      // xterm 6 自绘滚动条宽度（默认 14）；略宽于全局 7px，避免胶囊边再削后过细
      overviewRuler: { width: 10 },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    applyTerminalHostColors(host, theme);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const disposable = term.onData((data) => {
      const id = activeIdRef.current;
      if (!id || id.startsWith("preview:")) return;
      const meta = sessionsRef.current.find((s) => s.sessionId === id);
      // 已退出的会话不再写入；运行中可交互（含 Ctrl+C）
      if (meta && meta.status !== "running" && meta.status !== "starting") return;
      void writeTerminal(id, data);
    });

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            try {
              fit.fit();
              const dims = { cols: term.cols, rows: term.rows };
              const id = activeIdRef.current;
              if (id && !id.startsWith("preview:")) {
                void resizeTerminal(id, dims.cols, dims.rows);
              }
            } catch {
              /* 未挂载时忽略 */
            }
          })
        : null;
    ro?.observe(host);

    return () => {
      disposable.dispose();
      ro?.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // 仅挂载一次；主题变更由下方 effect 同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外观变更时同步 xterm + 宿主底色
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const next = readXtermTheme(theme);
    term.options.theme = next;
    applyTerminalHostColors(hostRef.current, theme);
    term.refresh(0, Math.max(0, term.rows - 1));
  }, [theme, themeId]);

  // 可见时补 fit
  useEffect(() => {
    if (!active) return;
    const fit = fitRef.current;
    const term = termRef.current;
    if (!fit || !term) return;
    requestAnimationFrame(() => {
      try {
        fit.fit();
        const id = activeIdRef.current;
        if (id) void resizeTerminal(id, term.cols, term.rows);
      } catch {
        /* ignore */
      }
    });
  }, [active, activeId]);

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
        setActiveId(list[list.length - 1]!.sessionId);
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
          termRef.current?.write(event.data);
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // 切换会话：清屏，优先本地缓冲，否则从主进程拉取
  useEffect(() => {
    const term = termRef.current;
    if (!term || !activeId) return;
    const seq = ++loadSeqRef.current;
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
  }, [activeId]);

  function focusSession(detail: OpenTerminalDetail) {
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
    // 无 sessionId：用预览造本地只读会话
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
  }

  // 挂载时消费跳转前暂存的打开请求（面板此前未挂载会漏掉事件）
  useEffect(() => {
    const pending = consumePendingOpenTerminal();
    if (pending) focusSession(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部聚焦
  useEffect(() => {
    if (!focusSessionId) return;
    focusSession({ sessionId: focusSessionId });
    onFocusSessionConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSessionId, onFocusSessionConsumed]);

  // 全局「打开终端」事件（面板已挂载时）
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<OpenTerminalDetail>).detail ?? {};
      // 事件已派发则清空 pending，避免 mount 消费重复
      consumePendingOpenTerminal();
      focusSession(detail);
    }
    window.addEventListener(OPEN_TERMINAL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TERMINAL_EVENT, onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  async function onNew(profileId?: string) {
    if (creating) return;
    setCreating(true);
    setNewMenuOpen(false);
    try {
      const session = await createTerminal(
        profileId ? { profileId } : undefined,
      );
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

  function openNewMenu() {
    const rect = newSplitRef.current?.getBoundingClientRect() ?? null;
    setNewMenuAnchor(rect);
    setNewMenuOpen((v) => !v);
  }

  async function onKill(sessionId: string) {
    // 先本地移除，避免 kill 的 exit 事件把会话又写回列表
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
  const shellProfileId =
    window.thinker?.settings?.getGeneralSync?.()?.shellProfileId ?? "default";
  const defaultProfile = resolveDefaultProfile(shellProfiles, shellProfileId);
  const defaultShellLabel = defaultProfile?.name?.trim() || "—";
  const showEmpty = !activeId;

  if (!available) {
    return (
      <div className="terminal-pane terminal-pane--empty">
        <div className="terminal-pane__empty">
          <EmptyState
            className="terminal-pane__empty-state"
            icon={
              <span className="terminal-pane__empty-icon" aria-hidden="true">
                <ConsoleIcon size="lg" />
              </span>
            }
            title={t("inspector.unavailableTitle")}
            description={t("inspector.unavailableBody", { cmd: "pnpm run dev" })}
          />
        </div>
      </div>
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
          <div className="terminal-pane__empty">
            <EmptyState
              className="terminal-pane__empty-state"
              icon={
                <span className="terminal-pane__empty-icon" aria-hidden="true">
                  <ConsoleIcon size="lg" />
                </span>
              }
              title={t("terminal.emptyTitle")}
              description={t("terminal.emptyBody")}
              action={
                <Button
                  size="sm"
                  variant="primary"
                  disabled={creating}
                  startIcon={<PlusIcon size="sm" />}
                  onClick={() => void onNew()}
                >
                  {t("terminal.new")}
                </Button>
              }
            />
          </div>
        ) : null}
      </div>
      <aside className="terminal-pane__list" aria-label={t("terminal.sessions")}>
        <div className="terminal-pane__list-head">
          <span className="terminal-pane__list-label">{t("terminal.sessions")}</span>
          <div
            ref={newSplitRef}
            className={`terminal-pane__new-split${newMenuOpen ? " is-open" : ""}`}
          >
            <button
              type="button"
              className="terminal-pane__default-shell"
              title={defaultProfile?.name ?? t("terminal.newMenu")}
              aria-label={t("terminal.newMenu")}
              aria-expanded={newMenuOpen}
              aria-haspopup="menu"
              disabled={creating || shellProfiles.length === 0}
              onClick={openNewMenu}
            >
              {defaultShellLabel}
            </button>
            <IconButton
              aria-label={t("terminal.new")}
              size="sm"
              variant="ghost"
              disabled={creating}
              onClick={() => void onNew()}
            >
              <PlusIcon size="sm" />
            </IconButton>
            <IconButton
              aria-label={t("terminal.newMenu")}
              aria-expanded={newMenuOpen}
              aria-haspopup="menu"
              size="sm"
              variant="ghost"
              disabled={creating || shellProfiles.length === 0}
              onClick={openNewMenu}
            >
              <ChevronRightIcon size="sm" className="terminal-pane__new-chev" />
            </IconButton>
          </div>
          <ContextMenu
            open={newMenuOpen}
            anchor={newMenuAnchor}
            onClose={() => setNewMenuOpen(false)}
            aria-label={t("terminal.newMenu")}
            items={shellProfiles.map((p) => ({
              label: p.name,
              onSelect: () => {
                void onNew(p.id);
              },
            }))}
          />
        </div>
        <ul className="terminal-pane__sessions">
          {sessions.map((s) => (
            <li key={s.sessionId}>
              <button
                type="button"
                className={`terminal-pane__session${s.sessionId === activeId ? " is-active" : ""}`}
                onClick={() => setActiveId(s.sessionId)}
              >
                <span
                  className={`terminal-pane__dot${
                    s.status === "running" || s.status === "starting" ? " is-running" : ""
                  }`}
                />
                <span className="terminal-pane__session-title">
                  {s.title || s.sessionId.slice(0, 8)}
                  {s.fromAgent ? (
                    <span className="terminal-pane__badge">
                      {s.backgrounded ? t("chat.shellBackgrounded") : t("terminal.fromAgent")}
                    </span>
                  ) : null}
                </span>
              </button>
              <IconButton
                aria-label={t("terminal.kill")}
                size="sm"
                variant="ghost"
                onClick={() => void onKill(s.sessionId)}
              >
                <CloseIcon />
              </IconButton>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
