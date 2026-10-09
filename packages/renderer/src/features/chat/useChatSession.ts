/**
 * 聊天会话状态：多会话 hydrate、流式事件合并、崩溃 Resume、防抖落库。
 */

import { PREVIEW_BODY_CHARS, withTextPreview } from "@thinker-workbench/logger";
import {
  type ChatMessage,
  type ChatTimelineStep,
  type GeneralSettings,
  createTraceId,
} from "@thinker-workbench/shared";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  cancelAgent,
  GENERAL_SETTINGS_CHANGED,
  onAgentEvent,
  pickDirectory,
  resumeAgent,
  runAgent,
} from "../../bridge/thinker";
import { workspaceWriteFile } from "../../bridge/workspaceFs";
import {
  createSession,
  createWorkspace,
  getActiveSessionId,
  getLastWorkspaceId,
  getSession,
  listSessions,
  listWorkspaces,
  onThreadsChanged,
  onWorkspacesChanged,
  saveSessionMessages,
  setActiveSession,
  setLastWorkspaceId,
} from "../../bridge/workspaces";
import { useT } from "../../i18n/I18nProvider";
import { appLog } from "../../log/sessionLog";
import { createMessage, toAgentHistory, visibleAssistantText } from "./messageModel";
import { classifyRunError } from "./runErrors";
import {
  appendError,
  appendReplyText,
  appendThinkingText,
  applyStatus,
  applyToolEvent,
  deactivateAll,
  isDeleteRestoreExpired,
  pruneExpiredDeleteRestoreCaches,
  readDeleteFileRestoreTtlDays,
} from "./timelineModel";
import {
  EMPTY_USAGE,
  addUsage,
  estimatePartialUsage,
  totalTokens,
} from "./usageStats";

/** 收集助手气泡之前的可见历史，供中断时粗估 input。 */
function collectInputTextsBefore(
  messages: ChatMessage[],
  assistantId: string,
): string[] {
  const texts: string[] = [];
  for (const m of messages) {
    if (m.id === assistantId) break;
    if (m.role === "user") {
      const t = m.text?.trim();
      if (t) texts.push(t);
    } else if (m.role === "assistant") {
      const t = visibleAssistantText(m);
      if (t) texts.push(t);
    }
  }
  return texts;
}

/** 比较两条时间线，保留工具行与 diff 更完整的一侧。 */
function pickRicherTimeline(
  a: ChatTimelineStep[],
  b: ChatTimelineStep[] | undefined,
): ChatTimelineStep[] {
  const score = (steps: ChatTimelineStep[]) => {
    let n = steps.length;
    for (const s of steps) {
      if (s.kind === "tool") {
        n += 10;
        if (s.diff) n += 100;
        if (s.phase === "end") n += 5;
      }
      if (s.kind === "status" && s.text) n += 3;
      if (s.kind === "text" && s.text) n += 2;
      if (s.kind === "error") n += 20;
    }
    return n;
  };
  const left = a ?? [];
  const right = b ?? [];
  return deactivateAll(score(left) >= score(right) ? left : right);
}

/**
 * 将失败收束为助手气泡内的错误时间线步（不改成 System 角色）。
 * 保留已流式的正文；错误只出现在 timeline。
 */
function failAssistantMessage(
  message: ChatMessage,
  errorText: string,
  timeline: ChatTimelineStep[],
  /** 显式错误码；省略时从文案推断。 */
  code?: string,
): ChatMessage {
  const nextTimeline = appendError(
    timeline,
    errorText,
    code ?? classifyRunError(errorText),
  );
  return {
    ...message,
    pending: false,
    role: "assistant",
    // 错误不进气泡正文，避免与时间线重复；保留已生成的部分回复
    text: message.text,
    timeline: nextTimeline,
  };
}

/**
 * 先前 Resume 失败时新建的空壳助手气泡（无正文、时间线仅 error）。
 * Resume 时应丢掉，继续写回真正的那条助手消息。
 */
function isResumeStubMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.text?.trim()) return false;
  const steps = message.timeline ?? [];
  return steps.length > 0 && steps.every((s) => s.kind === "error");
}

/**
 * 从磁盘 hydrate 时收束「进程已死但仍 active」的时间线。
 * - interrupted：保留 pending 以便 Resume，但关掉 thinking shimmer
 * - 其它终态：pending 一并清掉，避免永远 Planning
 */
function settleLoadedMessages(
  messages: ChatMessage[],
  runStatus: string | undefined,
): ChatMessage[] {
  if (runStatus === "running") return messages;
  const resumable = runStatus === "interrupted";
  return messages.map((m) => {
    if (m.role !== "assistant") return m;
    // 非运行中：清掉 live 计时，避免 hydrate 后误走表
    const base = m.runStartedAt != null ? { ...m, runStartedAt: undefined } : m;
    const hasActive = (base.timeline ?? []).some(
      (s) =>
        (s.kind === "status" && s.active) ||
        (s.kind === "tool" && s.active),
    );
    if (!hasActive && (resumable || !base.pending)) return base;
    return {
      ...base,
      pending: resumable ? base.pending : false,
      timeline: deactivateAll(base.timeline ?? []),
    };
  });
}

function scrollElToBottom(el: HTMLElement | null, behavior: ScrollBehavior = "smooth") {
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior });
}

/**
 * @param visible 聊天页是否在前台。离开再回来时用于立刻刷 token 并滚到底。
 */
export function useChatSession(visible = true) {
  const t = useT();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>();
  /** 当前侧栏 / 输入框展示的工作空间（可与活动会话同步）。 */
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  const [canResume, setCanResume] = useState(false);
  /** 发送前缺少工作空间 / 会话时的门禁（显示在输入框上方）。 */
  const [workspaceGate, setWorkspaceGate] = useState<{
    kind: "no-workspace" | "need-session";
    message: string;
  } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  /** 正在原位编辑的用户消息；未发送前不改历史。 */
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editingUserIdRef = useRef<string | null>(null);
  const editDraftRef = useRef("");
  const activeRunId = useRef<string | null>(null);
  const targetMsgId = useRef<string | null>(null);
  const runEpoch = useRef(0);
  /** 会话切换时递增，丢弃迟到事件。 */
  const sessionEpoch = useRef(0);
  const streamText = useRef("");
  /** 自上次官方 usage 以来未入账的回复正文（中断估算用）。 */
  const unbilledReply = useRef("");
  /** 自上次官方 usage 以来未入账的思考文本（中断估算用）。 */
  const unbilledThinking = useRef("");
  const timelineRef = useRef<ChatTimelineStep[]>([]);
  const raf = useRef<number | null>(null);
  const flushStreamRef = useRef<(() => void) | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const workspaceIdRef = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  function resetUnbilled() {
    unbilledReply.current = "";
    unbilledThinking.current = "";
  }

  /**
   * 取出未入账流式文本的粗估 usage，并清空缓冲。
   * 尚无官方 input 时，顺带用可见历史粗估 input。
   */
  function consumeUnbilledUsageEstimate(
    assistantId: string,
    existing: ChatMessage["usage"],
  ): ChatMessage["usage"] | null {
    const reply = unbilledReply.current;
    const thinking = unbilledThinking.current;
    resetUnbilled();
    const base = existing ?? EMPTY_USAGE;
    const delta = estimatePartialUsage({
      reply,
      thinking,
      inputTexts:
        base.inputTokens <= 0
          ? collectInputTextsBefore(messagesRef.current, assistantId)
          : undefined,
    });
    if (totalTokens(delta) <= 0) return null;
    return delta;
  }

  /** 中断 / 取消收束时把粗估 usage 打进助手消息。 */
  function withUnbilledUsageEstimate(message: ChatMessage): ChatMessage {
    const delta = consumeUnbilledUsageEstimate(message.id, message.usage);
    if (!delta) return message;
    return { ...message, usage: addUsage(message.usage ?? EMPTY_USAGE, delta) };
  }

  /** 给目标助手消息累加 usage（消息级）。 */
  function patchTargetUsage(delta: ChatMessage["usage"]) {
    if (!delta) return;
    const id = targetMsgId.current;
    if (!id) return;
    // 官方 usage 已覆盖本段流式输出，清空未入账缓冲以免中断时重复估算
    resetUnbilled();
    setMessages((prev) => {
      const next = prev.map((m) =>
        m.id === id
          ? { ...m, usage: addUsage(m.usage ?? EMPTY_USAGE, delta) }
          : m,
      );
      messagesRef.current = next;
      scheduleSave(next);
      return next;
    });
  }

  /** 本轮结束：把 live 段写入消息 durationMs。 */
  function endMessageClock(id: string | null = targetMsgId.current) {
    if (!id) return;
    setMessages((prev) => {
      const next = prev.map((m) => {
        if (m.id !== id || m.runStartedAt == null) return m;
        return {
          ...m,
          durationMs: (m.durationMs ?? 0) + Math.max(0, Date.now() - m.runStartedAt),
          runStartedAt: undefined,
        };
      });
      messagesRef.current = next;
      scheduleSave(next);
      return next;
    });
  }

  const empty = messages.length === 0;

  function clearUserEdit() {
    editingUserIdRef.current = null;
    editDraftRef.current = "";
    setEditingUserId(null);
    setEditDraft("");
  }

  function setEditDraftValue(value: string) {
    editDraftRef.current = value;
    setEditDraft(value);
  }

  /** 掐断当前运行但不改消息（原位重发前用，历史由截断覆盖）。 */
  function abortRunSilently() {
    runEpoch.current += 1;
    targetMsgId.current = null;
    void cancelAgent(activeRunId.current ?? undefined);
    activeRunId.current = null;
    streamText.current = "";
    resetUnbilled();
    timelineRef.current = [];
    if (raf.current != null) {
      window.cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    setBusy(false);
    setCanResume(false);
  }

  useEffect(() => {
    messagesRef.current = messages;
    // hydrate / 切会话后顺带清掉已过期的恢复缓存
    const ttl = readDeleteFileRestoreTtlDays();
    const pruned = pruneExpiredDeleteRestoreCaches(messages, ttl);
    if (pruned === messages) return;
    messagesRef.current = pruned;
    setMessages(pruned);
    scheduleSave(pruned);
  }, [messages]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  /** 按设置 TTL 定时清掉过期的删除恢复缓存；TTL 变更时立刻再扫一遍。 */
  useEffect(() => {
    function prune() {
      const ttl = readDeleteFileRestoreTtlDays();
      const next = pruneExpiredDeleteRestoreCaches(messagesRef.current, ttl);
      if (next === messagesRef.current) return;
      messagesRef.current = next;
      setMessages(next);
      scheduleSave(next);
    }
    const timer = window.setInterval(prune, 60_000);
    function onSettings(event: Event) {
      const detail = (event as CustomEvent<GeneralSettings>).detail;
      if (detail && typeof detail.deleteFileRestoreTtlDays === "number") {
        prune();
      }
    }
    window.addEventListener(GENERAL_SETTINGS_CHANGED, onSettings);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(GENERAL_SETTINGS_CHANGED, onSettings);
    };
  }, []);

  /** 防抖落库当前会话消息。 */
  function scheduleSave(nextMessages?: ChatMessage[]) {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const payload = nextMessages ?? messagesRef.current;
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void saveSessionMessages(sid, payload);
    }, 400);
  }

  async function flushSave() {
    const sid = sessionIdRef.current;
    if (!sid) return;
    if (saveTimer.current != null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await saveSessionMessages(sid, messagesRef.current);
  }

  /** 同步工作空间展示名与根路径；别名变更时刷新。 */
  async function syncWorkspaceLabel(id: string | null) {
    if (!id) {
      setWorkspaceId(null);
      setWorkspaceName(null);
      setWorkspaceRoot(null);
      return;
    }
    const workspaces = await listWorkspaces();
    const hit = workspaces.find((w) => w.id === id);
    setWorkspaceId(id);
    setWorkspaceName(hit?.name ?? null);
    setWorkspaceRoot(hit?.rootPath ?? null);
  }

  // 启动：恢复上次会话；否则恢复上次工作空间（及其最近会话）；再否则默认工作空间
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const workspaces = await listWorkspaces();
      if (cancelled) return;
      if (workspaces.length === 0) {
        await syncWorkspaceLabel(null);
        return;
      }

      const active = await getActiveSessionId();
      if (!cancelled && active) {
        const loaded = await getSession(active);
        if (!cancelled && loaded) {
          sessionEpoch.current += 1;
          setSessionId(loaded.session.id);
          setThreadId(loaded.session.threadId);
          const settled = settleLoadedMessages(
            loaded.messages,
            loaded.session.runStatus,
          );
          setMessages(settled);
          messagesRef.current = settled;
          setCanResume(loaded.session.runStatus === "interrupted");
          await syncWorkspaceLabel(loaded.session.workspaceId);
          await setLastWorkspaceId(loaded.session.workspaceId);
          return;
        }
      }

      const lastWsId = await getLastWorkspaceId();
      const ws =
        workspaces.find((w) => w.id === lastWsId) ?? workspaces[0] ?? null;
      if (!ws || cancelled) return;
      await setLastWorkspaceId(ws.id);
      await syncWorkspaceLabel(ws.id);

      const sessions = await listSessions(ws.id);
      if (cancelled) return;
      const latest = sessions[0];
      if (!latest) return;
      sessionEpoch.current += 1;
      const loaded = await getSession(latest.id);
      if (cancelled || !loaded) return;
      setSessionId(loaded.session.id);
      setThreadId(loaded.session.threadId);
      const settled = settleLoadedMessages(
        loaded.messages,
        loaded.session.runStatus,
      );
      setMessages(settled);
      messagesRef.current = settled;
      setCanResume(loaded.session.runStatus === "interrupted");
      await setActiveSession(loaded.session.id);
    })();
    return () => {
      cancelled = true;
    };
    // 仅挂载时恢复
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 别名等变更时刷新输入框工作空间名
  useEffect(() => {
    if (!workspaceId) return;
    return onWorkspacesChanged(() => {
      void syncWorkspaceLabel(workspaceId);
    });
  }, [workspaceId]);

  /**
   * 侧栏删除会话 / 清空工作空间后：DB 已无当前会话，但主区仍可能挂着内存消息。
   * 监听 threads 变更，若当前会话已不存在则切到同空间最近会话或清空主区。
   */
  async function reconcileIfSessionGone() {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const loaded = await getSession(sid);
    if (loaded) return;
    // 用户可能已切到别的会话
    if (sessionIdRef.current !== sid) return;

    // 会话已删：取消未落库的 save，避免 saveMessages 报 Session not found / 写回幽灵数据
    if (saveTimer.current != null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    runEpoch.current += 1;
    sessionEpoch.current += 1;
    const runId = activeRunId.current;
    activeRunId.current = null;
    targetMsgId.current = null;
    streamText.current = "";
    timelineRef.current = [];
    resetUnbilled();
    if (runId) void cancelAgent(runId);
    setBusy(false);
    setCanResume(false);
    clearUserEdit();
    setDraft("");
    setWorkspaceGate(null);
    setActiveTraceId(null);

    const wid = workspaceIdRef.current ?? (await getLastWorkspaceId());
    if (wid) {
      const workspaces = await listWorkspaces();
      if (workspaces.some((w) => w.id === wid)) {
        // 再次确认仍停在已删会话上（避免覆盖用户新选择）
        if (sessionIdRef.current !== sid && sessionIdRef.current != null) return;
        const sessions = await listSessions(wid);
        const latest = sessions[0];
        if (latest) {
          const next = await getSession(latest.id);
          if (sessionIdRef.current !== sid && sessionIdRef.current != null) return;
          setSessionId(latest.id);
          sessionIdRef.current = latest.id;
          setThreadId(latest.threadId);
          await setActiveSession(latest.id);
          await syncWorkspaceLabel(wid);
          const msgs = settleLoadedMessages(
            next?.messages ?? [],
            next?.session.runStatus,
          );
          setMessages(msgs);
          messagesRef.current = msgs;
          setCanResume(next?.session.runStatus === "interrupted");
          return;
        }
        setSessionId(null);
        sessionIdRef.current = null;
        setThreadId(undefined);
        await setActiveSession(null);
        setMessages([]);
        messagesRef.current = [];
        await syncWorkspaceLabel(wid);
        return;
      }
    }

    if (sessionIdRef.current !== sid && sessionIdRef.current != null) return;
    setSessionId(null);
    sessionIdRef.current = null;
    setThreadId(undefined);
    await setActiveSession(null);
    setMessages([]);
    messagesRef.current = [];
    await syncWorkspaceLabel(null);
  }

  useEffect(() => {
    return onThreadsChanged(() => {
      void reconcileIfSessionGone();
    });
    // 仅挂载订阅；逻辑读 ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 用 messages/busy 触发滚底
  useEffect(() => {
    scrollElToBottom(scroller.current, visible ? "smooth" : "auto");
  }, [messages, busy, visible]);

  useEffect(() => {
    if (!visible) return;
    if (raf.current != null) {
      window.cancelAnimationFrame(raf.current);
      raf.current = null;
      flushStreamRef.current?.();
    }
    const id = window.requestAnimationFrame(() => {
      scrollElToBottom(scroller.current, "auto");
    });
    return () => window.cancelAnimationFrame(id);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    inputRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    const patchTarget = (patch: Partial<ChatMessage> & { timeline?: ChatTimelineStep[] }) => {
      const id = targetMsgId.current;
      if (!id) return;
      if (patch.timeline) timelineRef.current = patch.timeline;
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m));
        messagesRef.current = next;
        scheduleSave(next);
        return next;
      });
    };

    const flushStream = () => {
      raf.current = null;
      const id = targetMsgId.current;
      if (!id) return;
      const text = streamText.current;
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === id ? { ...m, text, pending: true, timeline: [...timelineRef.current] } : m,
        );
        messagesRef.current = next;
        return next;
      });
    };
    flushStreamRef.current = flushStream;

    const scheduleFlush = () => {
      if (raf.current != null) return;
      raf.current = window.requestAnimationFrame(flushStream);
    };

    const unsub = onAgentEvent((event) => {
      // 仅处理当前 thread 的事件（切换会话后丢弃迟到事件）
      if (threadId && event.threadId !== threadId) return;

      if (event.type === "usage") {
        if (activeRunId.current && event.runId !== activeRunId.current) return;
        if (!activeRunId.current) activeRunId.current = event.runId;
        patchTargetUsage(event.usage);
        return;
      }

      const id = targetMsgId.current;
      if (!id) return;
      if (
        event.type !== "token" &&
        event.type !== "done" &&
        event.type !== "error" &&
        event.type !== "status" &&
        event.type !== "tool"
      ) {
        return;
      }
      if (activeRunId.current && event.runId !== activeRunId.current) return;
      activeRunId.current = event.runId;
      setThreadId(event.threadId);

      if (event.type === "status") {
        timelineRef.current = applyStatus(timelineRef.current, event.status);
        patchTarget({ timeline: [...timelineRef.current], pending: true });
        return;
      }

      if (event.type === "tool") {
        timelineRef.current = applyToolEvent(timelineRef.current, event);
        patchTarget({ timeline: [...timelineRef.current], pending: true });
        return;
      }

      if (event.type === "token") {
        const channel = event.channel ?? "reply";
        if (channel === "thinking") {
          unbilledThinking.current += event.text;
          timelineRef.current = appendThinkingText(timelineRef.current, event.text);
          scheduleFlush();
          return;
        }
        unbilledReply.current += event.text;
        timelineRef.current = appendReplyText(timelineRef.current, event.text);
        streamText.current += event.text;
        scheduleFlush();
        return;
      }

      if (raf.current != null) {
        window.cancelAnimationFrame(raf.current);
        raf.current = null;
      }

      if (event.type === "done") {
        const text = event.text || streamText.current;
        streamText.current = text;
        timelineRef.current = deactivateAll(timelineRef.current);
        setCanResume(false);
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  pending: false,
                  role: "assistant" as const,
                  text,
                  timeline: [...timelineRef.current],
                }
              : m,
          );
          messagesRef.current = next;
          scheduleSave(next);
          return next;
        });
      }

      if (event.type === "error") {
        // 手动取消的 error 仍可 Resume；勿清掉 cancel() 刚置位的 canResume
        const cancelled = classifyRunError(event.error) === "CANCELLED";
        setCanResume(cancelled);
        setMessages((prev) => {
          const next = prev.map((m) => {
            if (m.id !== id) return m;
            const baseTimeline =
              timelineRef.current.length ? timelineRef.current : (m.timeline ?? []);
            // 本地已写入「已停止」CANCELLED 时，保留友好文案，勿被 agent 的 "…cancelled" 盖掉
            const alreadyStopped = baseTimeline.some(
              (s) => s.kind === "error" && s.code === "CANCELLED",
            );
            if (cancelled && alreadyStopped) {
              const settled = {
                ...m,
                pending: false,
                text: streamText.current || m.text,
                timeline: deactivateAll(baseTimeline),
              };
              timelineRef.current = settled.timeline ?? [];
              return settled;
            }
            const failed = failAssistantMessage(
              withUnbilledUsageEstimate({
                ...m,
                text: streamText.current || m.text,
              }),
              event.error,
              baseTimeline,
            );
            timelineRef.current = failed.timeline ?? [];
            return failed;
          });
          messagesRef.current = next;
          scheduleSave(next);
          return next;
        });
      }
    });

    return () => {
      flushStreamRef.current = null;
      unsub();
    };
    // scheduleSave 读 ref，勿列入依赖以免重订事件
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    return () => {
      if (raf.current != null) window.cancelAnimationFrame(raf.current);
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    };
  }, []);

  /** 切换到指定会话；busy 时由侧栏拦截。 */
  async function selectSession(nextSessionId: string, nextThreadId: string) {
    if (busy) return;
    await flushSave();
    sessionEpoch.current += 1;
    const loaded = await getSession(nextSessionId);
    setSessionId(nextSessionId);
    sessionIdRef.current = nextSessionId;
    setThreadId(nextThreadId);
    await setActiveSession(nextSessionId);
    const wid = loaded?.session.workspaceId ?? null;
    if (wid) {
      await setLastWorkspaceId(wid);
      await syncWorkspaceLabel(wid);
    }
    const msgs = settleLoadedMessages(
      loaded?.messages ?? [],
      loaded?.session.runStatus,
    );
    setMessages(msgs);
    messagesRef.current = msgs;
    setCanResume(loaded?.session.runStatus === "interrupted");
    setWorkspaceGate(null);
    clearUserEdit();
    setDraft("");
    activeRunId.current = null;
    targetMsgId.current = null;
    streamText.current = "";
    timelineRef.current = [];
  }

  /** 新建会话后激活空聊天。 */
  async function activateNewSession(nextSessionId: string, nextThreadId: string) {
    if (busy) return;
    await flushSave();
    sessionEpoch.current += 1;
    const loaded = await getSession(nextSessionId);
    setSessionId(nextSessionId);
    sessionIdRef.current = nextSessionId;
    setThreadId(nextThreadId);
    await setActiveSession(nextSessionId);
    const wid = loaded?.session.workspaceId ?? null;
    if (wid) {
      await setLastWorkspaceId(wid);
      await syncWorkspaceLabel(wid);
    }
    setMessages([]);
    messagesRef.current = [];
    setCanResume(false);
    setWorkspaceGate(null);
    clearUserEdit();
    setDraft("");
    activeRunId.current = null;
    targetMsgId.current = null;
    streamText.current = "";
    timelineRef.current = [];
  }

  /** 在当前工作空间新建会话（快捷键 / 命令用）；忙碌时忽略。 */
  async function newChat() {
    if (busy) return;
    let wid = workspaceId ?? (await getLastWorkspaceId());
    if (!wid) {
      const workspaces = await listWorkspaces();
      wid = workspaces[0]?.id ?? null;
    }
    if (!wid) {
      setWorkspaceGate({ kind: "no-workspace", message: t("chat.noWorkspace") });
      return;
    }
    const created = await createSession(wid);
    await activateNewSession(created.id, created.threadId);
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }

  /** 选中工作空间：记住选择；切到该空间最近会话，若无则清空当前聊天。 */
  async function selectWorkspace(nextWorkspaceId: string) {
    if (busy) return;
    await setLastWorkspaceId(nextWorkspaceId);
    await syncWorkspaceLabel(nextWorkspaceId);
    if (nextWorkspaceId === workspaceId && sessionId) return;

    const sessions = await listSessions(nextWorkspaceId);
    const latest = sessions[0];
    if (latest) {
      if (latest.id !== sessionId) await selectSession(latest.id, latest.threadId);
      return;
    }

    await flushSave();
    sessionEpoch.current += 1;
    setSessionId(null);
    setThreadId(undefined);
    sessionIdRef.current = null;
    await setActiveSession(null);
    setMessages([]);
    messagesRef.current = [];
    setCanResume(false);
    setWorkspaceGate(null);
    clearUserEdit();
    setDraft("");
    activeRunId.current = null;
    targetMsgId.current = null;
    streamText.current = "";
    timelineRef.current = [];
  }

  /**
   * @param override 快捷方式 / 原位编辑的正文。
   * @param replaceUserId 从该用户消息截断后重发；未传则追加到末尾。
   */
  async function send(override?: string, replaceUserId?: string | null) {
    const text = (override ?? draft).trim();
    if (!text) return;
    if (busy && !replaceUserId) return;

    // 必须有活动会话所属的工作空间；有工作空间无会话时自动建会话
    // getSession 返回 { session, messages }，工作空间在 session.workspaceId
    let sid = sessionId ?? (await getActiveSessionId());
    let sess = sid ? await getSession(sid) : null;
    let runThreadId = sess?.session.threadId ?? threadId;
    if (!sess?.session.workspaceId) {
      let wid = workspaceId ?? (await getLastWorkspaceId());
      if (!wid) {
        const workspaces = await listWorkspaces();
        wid = workspaces[0]?.id ?? null;
      }
      if (!wid) {
        setWorkspaceGate({ kind: "no-workspace", message: t("chat.noWorkspace") });
        return;
      }
      const created = await createSession(wid);
      sid = created.id;
      runThreadId = created.threadId;
      sessionEpoch.current += 1;
      setSessionId(created.id);
      setThreadId(created.threadId);
      await setActiveSession(created.id);
      await setLastWorkspaceId(wid);
      await syncWorkspaceLabel(wid);
      setMessages([]);
      messagesRef.current = [];
      sessionIdRef.current = created.id;
    }
    setWorkspaceGate(null);

    if (replaceUserId) {
      abortRunSilently();
      const idx = messagesRef.current.findIndex((m) => m.id === replaceUserId);
      if (idx >= 0) {
        const next = messagesRef.current.slice(0, idx);
        messagesRef.current = next;
        setMessages(next);
      }
    }
    clearUserEdit();
    setDraft("");
    setCanResume(false);
    const traceId = createTraceId();
    setActiveTraceId(traceId);
    const log = appLog("chat.send");
    log.info("submit", {
      traceId,
      threadId: runThreadId,
      meta: withTextPreview(text, "message", PREVIEW_BODY_CHARS),
    });

    const userMsg = createMessage("user", text);
    const pending: ChatMessage = {
      ...createMessage("assistant", "", true, []),
      runStartedAt: Date.now(),
      traceId,
    };
    // 在追加本轮气泡之前快照历史，避免把当前 user / 空助手也塞进模型上下文
    const history = toAgentHistory(messagesRef.current);
    targetMsgId.current = pending.id;
    activeRunId.current = null;
    streamText.current = "";
    resetUnbilled();
    timelineRef.current = [];
    if (raf.current != null) {
      window.cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    const epoch = ++runEpoch.current;
    setMessages((prev) => {
      const next = [...prev, userMsg, pending];
      messagesRef.current = next;
      scheduleSave(next);
      return next;
    });
    setBusy(true);
    try {
      const result = await runAgent({
        message: text,
        history,
        threadId: runThreadId,
        traceId,
      });
      if (epoch !== runEpoch.current) return;
      if (result.runId) activeRunId.current = result.runId;
      if (result.threadId) setThreadId(result.threadId);

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.setTimeout(resolve, 48);
        });
      });
      if (epoch !== runEpoch.current) return;

      log.info(result.ok ? "result ok" : "result error", {
        traceId,
        runId: result.runId,
        threadId: result.threadId,
        meta: result.ok
          ? withTextPreview(result.text || "", "text", PREVIEW_BODY_CHARS)
          : { error: result.error },
      });

      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.id !== pending.id) return m;
          const timeline = pickRicherTimeline(timelineRef.current, m.timeline);
          if (!result.ok) {
            const cancelled = classifyRunError(result.error || "") === "CANCELLED";
            const failed = failAssistantMessage(
              cancelled
                ? withUnbilledUsageEstimate({
                    ...m,
                    text: streamText.current || m.text,
                  })
                : { ...m, text: streamText.current || m.text },
              result.error || "Unknown error",
              timeline,
            );
            timelineRef.current = failed.timeline ?? [];
            return failed;
          }
          const text = result.text || streamText.current || m.text || "";
          timelineRef.current = timeline;
          return {
            ...m,
            pending: false,
            text,
            role: "assistant" as const,
            timeline,
          };
        });
        messagesRef.current = next;
        scheduleSave(next);
        return next;
      });
      // runAgent 以 cancel 收束时也要可 Resume（不只依赖 cancel() 置位）
      if (
        !result.ok &&
        classifyRunError(result.error || "") === "CANCELLED"
      ) {
        setCanResume(true);
      }
    } catch (err) {
      if (epoch !== runEpoch.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      log.error("result throw", { traceId, meta: { error: msg } });
      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.id !== pending.id) return m;
          const cancelled = classifyRunError(msg) === "CANCELLED";
          const failed = failAssistantMessage(
            cancelled
              ? withUnbilledUsageEstimate({
                  ...m,
                  text: streamText.current || m.text,
                })
              : { ...m, text: streamText.current || m.text },
            msg,
            pickRicherTimeline(timelineRef.current, m.timeline),
          );
          timelineRef.current = failed.timeline ?? [];
          return failed;
        });
        messagesRef.current = next;
        scheduleSave(next);
        return next;
      });
      if (classifyRunError(msg) === "CANCELLED") setCanResume(true);
    } finally {
      if (epoch === runEpoch.current) {
        endMessageClock(pending.id);
        setBusy(false);
        inputRef.current?.focus();
      }
    }
  }

  async function resume() {
    if (!threadId || busy) return;

    // 续写原先那条助手消息：丢掉末尾空壳错误气泡，再取最后一条 assistant
    let base = [...messagesRef.current];
    while (base.length > 0) {
      const last = base[base.length - 1]!;
      if (last.role === "assistant" && isResumeStubMessage(last)) {
        base = base.slice(0, -1);
        continue;
      }
      break;
    }
    const existing = [...base].reverse().find((m) => m.role === "assistant");
    if (!existing) return;

    setBusy(true);
    setCanResume(false);

    const pendingId = existing.id;
    const traceId = createTraceId();
    setActiveTraceId(traceId);
    targetMsgId.current = existing.id;
    activeRunId.current = null;
    streamText.current = existing.text || "";
    resetUnbilled();
    // 清掉上次失败残留的 error 步，保留已有正文 / 工具时间线
    timelineRef.current = deactivateAll(
      (existing.timeline ?? []).filter((s) => s.kind !== "error"),
    );

    setMessages(() => {
      const next = base.map((m) =>
        m.id === pendingId
          ? {
              ...m,
              timeline: [...timelineRef.current],
              pending: true,
              runStartedAt: Date.now(),
              traceId,
            }
          : m,
      );
      messagesRef.current = next;
      scheduleSave(next);
      return next;
    });

    const epoch = ++runEpoch.current;
    try {
      const result = await resumeAgent({ threadId, traceId });
      if (epoch !== runEpoch.current) return;
      if (result.runId) activeRunId.current = result.runId;
      if (!result.ok) {
        const errText = result.error || "Resume failed.";
        // 进程被热重载 / 退出掐断：保留 pending，可再次 Resume
        const crashed =
          /utilityProcess exited|ready timeout|Process exited|EPIPE|crash/i.test(errText);
        setMessages((prev) => {
          const next = prev.map((m) => {
            if (m.id !== pendingId) return m;
            if (crashed) {
              const timeline = deactivateAll(
                pickRicherTimeline(timelineRef.current, m.timeline),
              );
              timelineRef.current = timeline;
              return {
                ...m,
                pending: true,
                text: streamText.current || m.text,
                timeline,
              };
            }
            const cancelled = classifyRunError(errText) === "CANCELLED";
            const failed = failAssistantMessage(
              cancelled
                ? withUnbilledUsageEstimate({
                    ...m,
                    text: streamText.current || m.text,
                  })
                : { ...m, text: streamText.current || m.text },
              errText,
              pickRicherTimeline(timelineRef.current, m.timeline),
            );
            timelineRef.current = failed.timeline ?? [];
            return failed;
          });
          messagesRef.current = next;
          scheduleSave(next);
          return next;
        });
        if (crashed) setCanResume(true);
        else if (classifyRunError(errText) === "CANCELLED") setCanResume(true);
        return;
      }
      // done 事件可能已写完；若仍 pending 则用 result 收束
      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.id !== pendingId || !m.pending) return m;
          const text = result.text || streamText.current || m.text || "";
          timelineRef.current = deactivateAll(
            pickRicherTimeline(timelineRef.current, m.timeline),
          );
          return {
            ...m,
            pending: false,
            text,
            role: "assistant" as const,
            timeline: [...timelineRef.current],
          };
        });
        messagesRef.current = next;
        scheduleSave(next);
        return next;
      });
    } finally {
      if (epoch === runEpoch.current) {
        endMessageClock(pendingId);
        setBusy(false);
        inputRef.current?.focus();
      }
    }
  }

  function cancel() {
    if (!busy) return;
    runEpoch.current += 1;
    const id = targetMsgId.current;
    // 先掐断事件目标，避免迟到的 error 再写一条
    targetMsgId.current = null;
    void cancelAgent(activeRunId.current ?? undefined);
    if (id) {
      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.id !== id) return m;
          const withClock =
            m.runStartedAt != null
              ? {
                  ...m,
                  durationMs:
                    (m.durationMs ?? 0) + Math.max(0, Date.now() - m.runStartedAt),
                  runStartedAt: undefined,
                }
              : m;
          // 流末包 usage 常随中断丢失：用未入账正文 / 思考粗估
          const failed = failAssistantMessage(
            withUnbilledUsageEstimate({
              ...withClock,
              text: streamText.current || withClock.text,
            }),
            t("chat.stopped"),
            pickRicherTimeline(timelineRef.current, withClock.timeline),
            "CANCELLED",
          );
          timelineRef.current = failed.timeline ?? [];
          return failed;
        });
        messagesRef.current = next;
        scheduleSave(next);
        return next;
      });
    } else {
      resetUnbilled();
    }
    setBusy(false);
    // 手动停止保留 checkpoint，可从时间线「继续」续跑
    setCanResume(true);
    activeRunId.current = null;
    streamText.current = "";
    timelineRef.current = [];
    if (raf.current != null) {
      window.cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (busy) return;
      void send();
    }
  }

  /**
   * 点击已发送的用户消息：原位进入编辑，历史不动；发送时才从该条截断。
   */
  function beginEditUserMessage(messageId: string) {
    const idx = messagesRef.current.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const msg = messagesRef.current[idx];
    if (msg.role !== "user") return;
    if (editingUserIdRef.current === messageId) {
      editInputRef.current?.focus();
      return;
    }
    editingUserIdRef.current = messageId;
    setEditingUserId(messageId);
    const text = msg.text ?? "";
    editDraftRef.current = text;
    setEditDraft(text);
    window.requestAnimationFrame(() => {
      const el = editInputRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }

  function onEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      clearUserEdit();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const id = editingUserIdRef.current;
      if (!id) return;
      void send(editDraftRef.current, id);
    }
  }

  function sendUserEdit() {
    const id = editingUserIdRef.current;
    if (!id) return;
    void send(editDraftRef.current, id);
  }

  /**
   * 时间线 delete_file「恢复」：把删前缓存的正文写回工作区，并标记 restored。
   * 失败时抛错，供卡片展示提示。
   */
  async function restoreDeletedFile(messageId: string, stepId: string) {
    const wid = workspaceId;
    if (!wid) throw new Error(t("chat.noWorkspaceLabel"));
    const msg = messagesRef.current.find((m) => m.id === messageId);
    const step = msg?.timeline?.find((s) => s.id === stepId);
    if (!step || step.kind !== "tool" || step.name !== "delete_file") {
      throw new Error("delete_file step not found");
    }
    if (!step.path || typeof step.restoreContent !== "string") {
      throw new Error(t("chat.restoreDeletedFileUnavailable"));
    }

    const ttl = readDeleteFileRestoreTtlDays();
    if (isDeleteRestoreExpired(step, ttl)) {
      // 已超时：清缓存，不可再恢复
      const pruned = pruneExpiredDeleteRestoreCaches(messagesRef.current, ttl);
      if (pruned !== messagesRef.current) {
        messagesRef.current = pruned;
        setMessages(pruned);
        scheduleSave(pruned);
      }
      throw new Error(t("chat.restoreDeletedFileExpired"));
    }

    try {
      await workspaceWriteFile(wid, step.path, step.restoreContent);
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }

    setMessages((prev) => {
      const next = prev.map((m) => {
        if (m.id !== messageId || !m.timeline) return m;
        return {
          ...m,
          timeline: m.timeline.map((s) => {
            if (s.id !== stepId || s.kind !== "tool") return s;
            return {
              id: s.id,
              kind: "tool" as const,
              name: s.name,
              callId: s.callId,
              path: s.path,
              summary: s.summary,
              phase: s.phase,
              ok: s.ok,
              diff: s.diff,
              active: s.active,
              restored: true,
            };
          }),
        };
      });
      messagesRef.current = next;
      scheduleSave(next);
      return next;
    });
  }

  return {
    messages,
    draft,
    setDraft,
    busy,
    empty,
    scroller,
    inputRef,
    editInputRef,
    editingUserId,
    editDraft,
    setEditDraft: setEditDraftValue,
    beginEditUserMessage,
    cancelUserEdit: clearUserEdit,
    sendUserEdit,
    onEditKeyDown,
    activeTraceId,
    sessionId,
    threadId,
    canResume,
    workspaceGate,
    /** 门禁「打开」：选目录建工作空间并进入新会话。 */
    openWorkspaceFromGate: async () => {
      const dir = await pickDirectory({ title: t("workspaces.pickDirectoryTitle") });
      if (!dir) return;
      const ws = await createWorkspace({ rootPath: dir });
      await setLastWorkspaceId(ws.id);
      await syncWorkspaceLabel(ws.id);
      const created = await createSession(ws.id);
      await activateNewSession(created.id, created.threadId);
      setWorkspaceGate(null);
    },
    workspaceId,
    workspaceName,
    workspaceRoot,
    send,
    cancel,
    resume,
    selectSession,
    selectWorkspace,
    activateNewSession,
    newChat,
    flushSave,
    onKeyDown,
    restoreDeletedFile,
  };
}
