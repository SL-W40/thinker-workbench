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
import { onTerminalEvent } from "../../bridge/terminal";
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
import { useT } from "../../i18n/useI18n";
import { appLog } from "../../log/sessionLog";
import { createMessage, toAgentHistory, visibleAssistantText } from "./messageModel";
import {
  classifyRunError,
  isSoftStopCode,
  softStopResumeKind,
} from "./runErrors";
import {
  appendError,
  appendModelSwitch,
  appendReplyText,
  appendShellLiveOutput,
  appendThinkingText,
  applyHitlRequest,
  applyHitlResolved,
  applyStatus,
  applySubagentEvent,
  applyToolEvent,
  bindShellSessionId,
  freezeTimelineHistory,
  deactivateAll,
  isDeleteRestoreExpired,
  pruneExpiredDeleteRestoreCaches,
  readDeleteFileRestoreTtlDays,
} from "./timelineModel";
import { extractContextPaths } from "./composerMentions";
import type { ComposerEditorHandle } from "./ComposerEditor";
import {
  ensureLiveRunRegistry,
  listBusyLiveRuns,
  parkForegroundRun,
  setForegroundSessionId,
  subscribeLiveRuns,
  takeLiveRunSlot,
  upsertLiveRunSlot,
} from "./liveRunRegistry";
import {
  EMPTY_USAGE,
  addUsage,
  estimatePartialUsage,
  totalTokens,
} from "./usageStats";

/** 收集助手气泡之前的可见历史，供中断时粗估 input*/
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

/** 比较两条时间线，保留工具行与 diff 更完整的一侧*/
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

/** 结算消息级耗时（把 live 段写入 durationMs）*/
function settleMessageClock(message: ChatMessage): ChatMessage {
  if (message.runStartedAt == null) return message;
  return {
    ...message,
    durationMs:
      (message.durationMs ?? 0) + Math.max(0, Date.now() - message.runStartedAt),
    runStartedAt: undefined,
  };
}

/**
 * 保留已流式的正文；错误只出现在 timeline。失败时一并结算耗时。
 */
function failAssistantMessage(
  message: ChatMessage,
  errorText: string,
  timeline: ChatTimelineStep[],
  /** 显式错误码；省略时从文案推断*/
  code?: string,
): ChatMessage {
  const resolved = code ?? classifyRunError(errorText);
  const nextTimeline = appendError(timeline, errorText, resolved);
  return settleMessageClock({
    ...message,
    pending: false,
    role: "assistant",
    // 错误不进气泡正文，避免与时间线重复；保留已生成的部分回复
    text: message.text,
    timeline: nextTimeline,
  });
}

/** 续跑前可丢掉的空壳错误助手气泡。 */
function isResumeStubMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.text?.trim()) return false;
  const steps = message.timeline ?? [];
  return steps.length > 0 && steps.every((s) => s.kind === "error");
}

/**
 * 从磁盘 hydrate 时收束「进程已死但仍 active」的时间线。
 * - cancelled / crashed：清掉 pending（Resume 看 runStatus + checkpoint），补软中断行
 * - 其它终态：一并清 pending，避免永远 Planning
*/
function settleLoadedMessages(
  messages: ChatMessage[],
  runStatus: string | undefined,
): ChatMessage[] {
  if (runStatus === "running") return messages;
  const resumable = runStatus === "cancelled" || runStatus === "crashed";
  return messages.map((m) => {
    if (m.role !== "assistant") return m;
 // 非运行中：丢掉 live 计时字段；时间线用历史冻结（禁止墙钟重算）
    let base = m.runStartedAt != null ? { ...m, runStartedAt: undefined } : m;
    let timeline = freezeTimelineHistory(base.timeline ?? [], base.durationMs);
    const hasSoft = timeline.some((s) => s.kind === "error" && isSoftStopCode(s.code));
    // 崩溃 / 取消恢复：补一条软中断，便于时间线展示「继续。
    if (resumable && !hasSoft) {
      const softCode = runStatus === "crashed" ? "PROCESS_EXIT" : "CANCELLED";
      const softMsg =
        softCode === "PROCESS_EXIT" ? "Exited unexpectedly." : "Stopped.";
      timeline = appendError(timeline, softMsg, softCode);
    }
    // 非运行中：丢掉 live 计时字段；时间线用历史冻结（禁止墙钟重算）
    if ((base.durationMs ?? 0) <= 0) {
      let inferred = 0;
      for (const s of timeline) {
        if (s.kind === "status" && typeof s.durationMs === "number") {
          inferred += s.durationMs;
        }
      }
      if (inferred > 0) base = { ...base, durationMs: inferred };
    }
    return {
      ...base,
      pending: false,
      timeline,
    };
  });
}

/** 从会话 runStatus 推导 Resume 种类*/
function resumeKindFromRunStatus(
  runStatus: string | undefined,
): null | "cancelled" | "crashed" {
  if (runStatus === "crashed") return "crashed";
  if (runStatus === "cancelled") return "cancelled";
  return null;
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
  /** 当前侧栏 / 输入框展示的工作空间（可与活动会话同步）*/
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  /** cancelled：仅时间线可续；crashed：输入区也提示检查点续跑*/
  const [resumeKind, setResumeKind] = useState<null | "cancelled" | "crashed">(null);
  const canResume = resumeKind != null;
  const setCanResume = (v: boolean | "cancelled" | "crashed") => {
    if (v === false) setResumeKind(null);
    else if (v === true) setResumeKind("cancelled");
    else setResumeKind(v);
  };
  /** 发送前缺少工作空间 / 会话时的门禁（显示在输入框上方）*/
  const [workspaceGate, setWorkspaceGate] = useState<{
    kind: "no-workspace" | "need-session";
    message: string;
  } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  /**
   * 递增以请求舞台强制贴底（发送 / 续跑 / 切会话）。
   * 普通 hydrate / 流式更新不递增，避免打断用户上翻。
   */
  const [stickNonce, setStickNonce] = useState(0);
  function requestStickToBottom() {
    setStickNonce((n) => n + 1);
  }
  const inputRef = useRef<ComposerEditorHandle | null>(null);
  const editInputRef = useRef<ComposerEditorHandle | null>(null);
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
  /** 手动停止后抑制直播重挂，直到下一次 send / resume。 */
  const suppressLiveRef = useRef(false);
  /** 自上次官方 usage 以来未入账的回复正文（中断估算用）*/
  const unbilledReply = useRef("");
  /** 自上次官方 usage 以来未入账的思考文本（中断估算用）*/
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

  /** 中断 / 取消收束时把粗估 usage 打进助手消息*/
  function withUnbilledUsageEstimate(message: ChatMessage): ChatMessage {
    const delta = consumeUnbilledUsageEstimate(message.id, message.usage);
    if (!delta) return message;
    return { ...message, usage: addUsage(message.usage ?? EMPTY_USAGE, delta) };
  }

  /** 给目标助手消息累加 usage（消息级）*/
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

  /** 本轮结束：把 live 段写入消息 durationMs*/
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

  /** 掐断当前运行但不改消息（原位重发前用，历史由截断覆盖）*/
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

  /** 防抖落库当前会话消息*/
  function scheduleSave(nextMessages?: ChatMessage[]) {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const payload = nextMessages ?? messagesRef.current;
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      // 定时器触发时若已切走 / 清空，丢弃过期落库
      if (sessionIdRef.current !== sid) return;
      void saveSessionMessages(sid, payload).catch(() => {
        // 会话可能已删；主进程已幂等忽略，此处吞掉以免未处理 rejection
      });
    }, 400);
  }

  async function flushSave() {
    const sid = sessionIdRef.current;
    if (!sid) return;
    if (saveTimer.current != null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try {
      await saveSessionMessages(sid, messagesRef.current);
    } catch {
      // 同上：已删会话的落库竞态
    }
  }

  /**
 * 将磁盘会话应用到 UI：running 时重新挂上 pending 助手；非 running 才回写冻结耗时。
 * 避免 hydrate 后的 scheduleSave 覆盖主进程刚写入的 done 终态。
 */
  function applyLoadedSession(
    runStatus: string | undefined,
    messages: ChatMessage[],
    opts?: { activeRunId?: string | null },
  ) {
    const settled = settleLoadedMessages(messages, runStatus);
    setMessages(settled);
    messagesRef.current = settled;
    setCanResume(resumeKindFromRunStatus(runStatus) ?? false);

    const pending = [...settled]
      .reverse()
      .find((m) => m.role === "assistant" && m.pending);
    if (runStatus === "running" && pending) {
      targetMsgId.current = pending.id;
      streamText.current = pending.text || "";
      timelineRef.current = [...(pending.timeline ?? [])];
      activeRunId.current = opts?.activeRunId ?? activeRunId.current;
      setBusy(true);
      setCanResume(false);
      // 进行中勿把半截快照再次落库，防止盖住主进程 finalize
      return;
    }

    // running 但无 pending，或已终态：必须清 busy，避免空会话锁死发送钮
    setBusy(false);
    if (runStatus !== "running") {
      // 把冻结后的耗时写回，避免旧 startedAt 下次刷新再被墙钟拉长
      scheduleSave(settled);
    }
  }

  /** 从 DB 重载当前会话（主进程 done 收束后 / 刷新重挂失败时）*/
  async function reloadCurrentSessionFromDb() {
    const sid = sessionIdRef.current;
    if (!sid) return;
 // 已挂上直播目标时由事件流更新，勿被 DB 抢写
    if (targetMsgId.current) return;
    const loaded = await getSession(sid);
    if (!loaded || sessionIdRef.current !== sid) return;
 // 取消时主进程可能先落了偏旧快照：合并本地更完整的时间线 / 正文
    const merged = loaded.messages.map((m) => {
      const loc = messagesRef.current.find((x) => x.id === m.id);
      if (!loc || m.role !== "assistant") return m;
      const timeline = pickRicherTimeline(loc.timeline ?? [], m.timeline);
      const text =
        (loc.text?.length ?? 0) >= (m.text?.length ?? 0) ? (loc.text ?? m.text) : m.text;
      return {
        ...m,
        text,
        timeline,
        pending: Boolean(m.pending) && Boolean(loc.pending),
      };
    });
    applyLoadedSession(loaded.session.runStatus, merged, {
      activeRunId: loaded.session.activeRunId,
    });
  }

  /** 同步工作空间展示名与根路径；别名变更时刷新*/
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
          sessionIdRef.current = loaded.session.id;
          setSessionId(loaded.session.id);
          setThreadId(loaded.session.threadId);
          applyLoadedSession(loaded.session.runStatus, loaded.messages, {
            activeRunId: loaded.session.activeRunId,
          });
          await syncWorkspaceLabel(loaded.session.workspaceId);
          await setLastWorkspaceId(loaded.session.workspaceId);
          requestStickToBottom();
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
      sessionIdRef.current = loaded.session.id;
      setSessionId(loaded.session.id);
      setThreadId(loaded.session.threadId);
      applyLoadedSession(loaded.session.runStatus, loaded.messages, {
        activeRunId: loaded.session.activeRunId,
      });
      await setActiveSession(loaded.session.id);
      requestStickToBottom();
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
   * 侧栏删除会话 / 清空工作空间后：DB 已无当前会话，但主区仍可能挂着内存消息。   * 监听 threads 变更，若当前会话已不存在则切到同空间最近会话或清空主区。   */
  async function reconcileIfSessionGone() {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const loaded = await getSession(sid);
    if (loaded) return;
    // 用户可能已切到别的会
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
        // 再次确认仍停在已删会话上（避免覆盖用户新选择：
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
          applyLoadedSession(next?.session.runStatus, next?.messages ?? [], {
            activeRunId: next?.session.activeRunId,
          });
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
    ensureLiveRunRegistry();
    return onThreadsChanged(() => {
      void reconcileIfSessionGone();
 // 主进程 finalize 后拉终态（刷新期间错过 done 事件时）
      void reloadCurrentSessionFromDb();
    });
 // 仅挂载订阅；逻辑走 ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setForegroundSessionId(sessionId);
  }, [sessionId]);

  const [liveRunTick, setLiveRunTick] = useState(0);
  useEffect(() => {
    return subscribeLiveRuns(() => setLiveRunTick((n) => n + 1));
  }, []);
  const backgroundRunCount = listBusyLiveRuns().filter(
    (s) => s.sessionId !== sessionId,
  ).length;
  void liveRunTick;

  // 回到聊天页：冲掉未刷完的流式帧；不强制滚底（尊重用户阅读位置：
  useEffect(() => {
    if (!visible) return;
    if (raf.current != null) {
      window.cancelAnimationFrame(raf.current);
      raf.current = null;
      flushStreamRef.current?.();
    }
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

    const boundSessionEpoch = sessionEpoch.current;
    const unsub = onAgentEvent((event) => {
      // 会话已切换：丢弃绑定前的迟到事件
      if (sessionEpoch.current !== boundSessionEpoch) return;
 // 仅处理当前 thread 的事件
      if (threadId && event.threadId !== threadId) return;

      // 手动停止后：不重挂直播；终态仍合并 DB
      if (suppressLiveRef.current) {
        if (event.type === "done" || event.type === "error") {
          void reloadCurrentSessionFromDb();
        }
        return;
      }

 // 刷新后丢失 target：挂回仍 pending 的助手气泡，继续收流
      if (!targetMsgId.current) {
        const pending = [...messagesRef.current]
          .reverse()
          .find((m) => m.role === "assistant" && m.pending);
        if (pending) {
          targetMsgId.current = pending.id;
          streamText.current = pending.text || "";
          timelineRef.current = [...(pending.timeline ?? [])];
          activeRunId.current = event.runId;
          setBusy(true);
          setCanResume(false);
          setThreadId(event.threadId);
        } else if (event.type === "done" || event.type === "error") {
          // 无 pending 可挂：主进程应已 finalize，从 DB 拉终态
          void reloadCurrentSessionFromDb();
          return;
        } else {
          return;
        }
      }

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
        event.type !== "tool" &&
        event.type !== "hitl" &&
        event.type !== "model_switch" &&
        event.type !== "model_health" &&
        event.type !== "subagent"
      ) {
        return;
      }
      if (activeRunId.current && event.runId !== activeRunId.current) return;
      activeRunId.current = event.runId;
      setThreadId(event.threadId);

      if (event.type === "hitl") {
        if (event.phase === "request" && event.request?.kind === "shell_approval") {
          timelineRef.current = applyHitlRequest(timelineRef.current, event.request);
          patchTarget({ timeline: [...timelineRef.current], pending: true });
        } else if (event.phase === "resolved") {
          timelineRef.current = applyHitlResolved(
            timelineRef.current,
            event.hitlId,
            event.response?.actionId,
          );
          patchTarget({ timeline: [...timelineRef.current], pending: true });
        }
        return;
      }

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

      if (event.type === "model_switch") {
        timelineRef.current = appendModelSwitch(timelineRef.current, event);
        patchTarget({ timeline: [...timelineRef.current], pending: true });
        return;
      }

      if (event.type === "subagent") {
        timelineRef.current = applySubagentEvent(timelineRef.current, event);
        patchTarget({ timeline: [...timelineRef.current], pending: true });
        return;
      }

      if (event.type === "model_health") {
        // 仅落盘由 main 处理；UI 无需展示
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
              ? settleMessageClock({
                  ...m,
                  pending: false,
                  role: "assistant" as const,
                  text,
                  timeline: [...timelineRef.current],
                })
              : m,
          );
          messagesRef.current = next;
          scheduleSave(next);
          return next;
        });
        // 刷新重挂场景没有 await runAgent，须在此收束 busy
        targetMsgId.current = null;
        activeRunId.current = null;
        setBusy(false);
        if (sessionIdRef.current && event.threadId) {
          upsertLiveRunSlot({
            sessionId: sessionIdRef.current,
            threadId: event.threadId,
            runId: null,
            messages: messagesRef.current,
            busy: false,
            targetMsgId: null,
            streamText: "",
            timeline: [],
          });
        }
        return;
      }

      if (event.type === "error") {
        const errCode = classifyRunError(event.error);
        const resume = softStopResumeKind(event.error, errCode);
 // 手动取消：仅时间线可续；进程异常：时间线可续
        setCanResume(resume ?? false);
        setMessages((prev) => {
          const next = prev.map((m) => {
            if (m.id !== id) return m;
            const baseTimeline =
              timelineRef.current.length ? timelineRef.current : (m.timeline ?? []);
 // 本地已写入「已停止」CANCELLED 时，保留友好文案，勿被 agent 的 "…cancelled" 覆盖
            const alreadyStopped = baseTimeline.some(
              (s) => s.kind === "error" && s.code === "CANCELLED",
            );
            if (errCode === "CANCELLED" && alreadyStopped) {
              const settled = settleMessageClock({
                ...m,
                pending: false,
                text: streamText.current || m.text,
                timeline: deactivateAll(baseTimeline),
              });
              timelineRef.current = settled.timeline ?? [];
              return settled;
            }
            const display =
              errCode === "PROCESS_EXIT"
                ? "Exited unexpectedly."
                : errCode === "CANCELLED"
                  ? "Stopped."
                  : event.error;
            const failed = failAssistantMessage(
              withUnbilledUsageEstimate({
                ...m,
                text: streamText.current || m.text,
              }),
              display,
              baseTimeline,
              errCode,
            );
            timelineRef.current = failed.timeline ?? [];
            return failed;
          });
          messagesRef.current = next;
          scheduleSave(next);
          return next;
        });
        targetMsgId.current = null;
        activeRunId.current = null;
        setBusy(false);
        if (sessionIdRef.current && event.threadId) {
          upsertLiveRunSlot({
            sessionId: sessionIdRef.current,
            threadId: event.threadId,
            runId: null,
            messages: messagesRef.current,
            busy: false,
            targetMsgId: null,
            streamText: "",
            timeline: [],
          });
        }
      }
    });

    return () => {
      flushStreamRef.current = null;
      unsub();
    };
 // scheduleSave 用 ref，勿列入依赖以免重订事件
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // 终端输出 → 时间线 shell 步骤 liveOutput
  useEffect(() => {
    return onTerminalEvent((event) => {
      const id = targetMsgId.current;
      if (!id) return;
      if (event.type === "created" && event.session.fromAgent) {
        timelineRef.current = bindShellSessionId(
          timelineRef.current,
          event.session.sessionId,
          { runId: event.session.runId, command: event.session.command },
        );
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === id
              ? { ...m, pending: true, timeline: [...timelineRef.current] }
              : m,
          );
          messagesRef.current = next;
          return next;
        });
        return;
      }
      if (event.type !== "data") return;
      timelineRef.current = appendShellLiveOutput(
        timelineRef.current,
        event.data,
        event.sessionId,
      );
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === id
            ? { ...m, pending: true, timeline: [...timelineRef.current] }
            : m,
        );
        messagesRef.current = next;
        return next;
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (raf.current != null) window.cancelAnimationFrame(raf.current);
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    };
  }, []);

  /** 打断未刷完的流式帧，避免切会话后把旧 pending 写进新视图。 */
  function cancelPendingStreamFlush() {
    if (raf.current != null) {
      window.cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  }

  /**
   * 切换到指定会话：切换是视图操作，不取消后台 run。
   * 先等齐数据，再在同一同步段里改 sessionId / messages / busy，避免 await 间隙闪一下进行中动画。
   */
  async function selectSession(nextSessionId: string, nextThreadId: string) {
    // 同会话：强制从 DB 重载（修复消息未展示 / 状态卡住）
    if (nextSessionId === sessionIdRef.current) {
      const loaded = await getSession(nextSessionId);
      applyLoadedSession(loaded?.session.runStatus, loaded?.messages ?? [], {
        activeRunId: loaded?.session.activeRunId,
      });
      requestStickToBottom();
      return;
    }

    // 封存当前前台流式态到 LiveRunRegistry，供后台继续
    const prevSid = sessionIdRef.current;
    const prevTid = threadId;
    if (prevSid && prevTid && (busy || activeRunId.current)) {
      parkForegroundRun({
        sessionId: prevSid,
        threadId: prevTid,
        runId: activeRunId.current,
        messages: messagesRef.current,
        streamText: streamText.current,
        timeline: timelineRef.current,
        targetMsgId: targetMsgId.current,
        busy,
      });
    }

    await flushSave();
    const loaded = await getSession(nextSessionId);

    // —— 以下为同步 UI 切换：中间不可 await ——
    cancelPendingStreamFlush();
    sessionEpoch.current += 1;
    suppressLiveRef.current = false;
    sessionIdRef.current = nextSessionId;
    setSessionId(nextSessionId);
    setForegroundSessionId(nextSessionId);
    setThreadId(nextThreadId);

    const live = takeLiveRunSlot(nextSessionId);
    if (live?.busy) {
      messagesRef.current = live.messages;
      setMessages(live.messages);
      activeRunId.current = live.runId;
      targetMsgId.current = live.targetMsgId;
      streamText.current = live.streamText;
      timelineRef.current = live.timeline;
      setBusy(true);
      setCanResume(false);
    } else {
      activeRunId.current = null;
      targetMsgId.current = null;
      streamText.current = "";
      timelineRef.current = [];
      applyLoadedSession(loaded?.session.runStatus, loaded?.messages ?? [], {
        activeRunId: loaded?.session.activeRunId,
      });
      if (loaded?.session.runStatus !== "running") {
        setBusy(false);
      }
    }
    setWorkspaceGate(null);
    clearUserEdit();
    setDraft("");
    requestStickToBottom();

    // 持久化侧栏选中等非绘制关键副作用
    await setActiveSession(nextSessionId);
    const wid = loaded?.session.workspaceId ?? null;
    if (wid) {
      await setLastWorkspaceId(wid);
      await syncWorkspaceLabel(wid);
    }
  }

  /** 新建会话后激活空聊天（其它会话可继续后台跑） */
  async function activateNewSession(nextSessionId: string, nextThreadId: string) {
    // 先封存当前忙会话
    if (busy && sessionIdRef.current && threadId) {
      parkForegroundRun({
        sessionId: sessionIdRef.current,
        threadId,
        runId: activeRunId.current,
        messages: messagesRef.current,
        streamText: streamText.current,
        timeline: timelineRef.current,
        targetMsgId: targetMsgId.current,
        busy: true,
      });
    }
    await flushSave();
    const loaded = await getSession(nextSessionId);

    cancelPendingStreamFlush();
    sessionEpoch.current += 1;
    sessionIdRef.current = nextSessionId;
    setSessionId(nextSessionId);
    setForegroundSessionId(nextSessionId);
    setThreadId(nextThreadId);
    setMessages([]);
    messagesRef.current = [];
    setBusy(false);
    setCanResume(false);
    setWorkspaceGate(null);
    clearUserEdit();
    setDraft("");
    activeRunId.current = null;
    targetMsgId.current = null;
    streamText.current = "";
    timelineRef.current = [];
    requestStickToBottom();

    await setActiveSession(nextSessionId);
    const wid = loaded?.session.workspaceId ?? null;
    if (wid) {
      await setLastWorkspaceId(wid);
      await syncWorkspaceLabel(wid);
    }
  }

  /** 在当前工作空间新建会话（快捷键 / 命令用） */
  async function newChat() {
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

  /** 选中工作空间：记住选择；切到该空间最近会话，若无则清空当前聊天 */
  async function selectWorkspace(nextWorkspaceId: string) {
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

    cancelPendingStreamFlush();
    sessionEpoch.current += 1;
    sessionIdRef.current = null;
    setSessionId(null);
    setThreadId(undefined);
    setMessages([]);
    messagesRef.current = [];
    setBusy(false);
    setCanResume(false);
    setWorkspaceGate(null);
    clearUserEdit();
    setDraft("");
    activeRunId.current = null;
    targetMsgId.current = null;
    streamText.current = "";
    timelineRef.current = [];
    requestStickToBottom();

    await setActiveSession(null);
  }

  /**
   * @param override 快捷方式 / 原位编辑的正文。   * @param replaceUserId 从该用户消息截断后重发；未传则追加到末尾。   */
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
      // 勿 bump sessionEpoch：会丢掉本轮即将到来的 agent 事件，导致气泡不更新、busy 卡住
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
    suppressLiveRef.current = false;
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
    requestStickToBottom();
    setBusy(true);
    if (sid && runThreadId) {
      upsertLiveRunSlot({
        sessionId: sid,
        threadId: runThreadId,
        messages: messagesRef.current,
        streamText: "",
        timeline: [],
        targetMsgId: pending.id,
        busy: true,
      });
    }
    try {
      const contextPaths = extractContextPaths(text);
      const result = await runAgent({
        message: text,
        history,
        threadId: runThreadId,
        sessionId: sid ?? undefined,
        traceId,
        ...(contextPaths.length > 0 ? { contextPaths } : {}),
      });
      if (epoch !== runEpoch.current) return;
      if (result.runId) {
        activeRunId.current = result.runId;
        if (sid) {
          upsertLiveRunSlot({
            sessionId: sid,
            threadId: result.threadId || runThreadId || "",
            runId: result.runId,
            messages: messagesRef.current,
            targetMsgId: pending.id,
            busy: true,
          });
        }
      }
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
            const errText = result.error || "Unknown error";
            const errCode = classifyRunError(errText);
            const soft = isSoftStopCode(errCode);
            const display =
              errCode === "PROCESS_EXIT"
                ? "Exited unexpectedly."
                : errCode === "CANCELLED"
                  ? "Stopped."
                  : errText;
            const failed = failAssistantMessage(
              soft
                ? withUnbilledUsageEstimate({
                    ...m,
                    text: streamText.current || m.text,
                  })
                : { ...m, text: streamText.current || m.text },
              display,
              timeline,
              errCode,
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
      if (!result.ok) {
        const resume = softStopResumeKind(result.error || "");
        if (resume) setCanResume(resume);
      }
    } catch (err) {
      if (epoch !== runEpoch.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      log.error("result throw", { traceId, meta: { error: msg } });
      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.id !== pending.id) return m;
          const errCode = classifyRunError(msg);
          const soft = isSoftStopCode(errCode);
          const display =
            errCode === "PROCESS_EXIT"
              ? "Exited unexpectedly."
              : errCode === "CANCELLED"
                ? "Stopped."
                : msg;
          const failed = failAssistantMessage(
            soft
              ? withUnbilledUsageEstimate({
                  ...m,
                  text: streamText.current || m.text,
                })
              : { ...m, text: streamText.current || m.text },
            display,
            pickRicherTimeline(timelineRef.current, m.timeline),
            errCode,
          );
          timelineRef.current = failed.timeline ?? [];
          return failed;
        });
        messagesRef.current = next;
        scheduleSave(next);
        return next;
      });
      {
        const resume = softStopResumeKind(msg);
        if (resume) setCanResume(resume);
      }
    } finally {
      if (raf.current != null) {
        window.cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      endMessageClock(pending.id);
      if (targetMsgId.current === pending.id) {
        targetMsgId.current = null;
      }
      // epoch 被 abort 抢占时对方已清 busy；否则必须收束，避免发送钮永久转圈
      if (epoch === runEpoch.current) {
        activeRunId.current = null;
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
    suppressLiveRef.current = false;
    requestStickToBottom();

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
    const sid = sessionIdRef.current;
    try {
      const result = await resumeAgent({
        threadId,
        traceId,
        sessionId: sid ?? undefined,
      });
      if (epoch !== runEpoch.current) return;
      if (result.runId) activeRunId.current = result.runId;
      if (!result.ok) {
        const errText = result.error || "Resume failed.";
        const noCheckpoint = /no checkpoint/i.test(errText);
        const resumeKind = noCheckpoint ? null : softStopResumeKind(errText);
        // 进程被热重载 / 退出打断：保留 pending，可再次 Resume；并补软中断
        const crashed = resumeKind === "crashed";
        setMessages((prev) => {
          const next = prev.map((m) => {
            if (m.id !== pendingId) return m;
            if (crashed) {
              let timeline = deactivateAll(
                pickRicherTimeline(timelineRef.current, m.timeline),
              );
              if (!timeline.some((s) => s.kind === "error" && isSoftStopCode(s.code))) {
                timeline = appendError(timeline, "Exited unexpectedly.", "PROCESS_EXIT");
              }
              timelineRef.current = timeline;
              return settleMessageClock({
                ...m,
                pending: true,
                text: streamText.current || m.text,
                timeline,
              });
            }
            const errCode = classifyRunError(errText);
            const soft = isSoftStopCode(errCode);
            const display = noCheckpoint
              ? errText
              : errCode === "PROCESS_EXIT"
                ? "Exited unexpectedly."
                : errCode === "CANCELLED"
                  ? "Stopped."
                  : errText;
            const failed = failAssistantMessage(
              soft
                ? withUnbilledUsageEstimate({
                    ...m,
                    text: streamText.current || m.text,
                  })
                : { ...m, text: streamText.current || m.text },
              display,
              pickRicherTimeline(timelineRef.current, m.timeline),
              errCode,
            );
            timelineRef.current = failed.timeline ?? [];
            return failed;
          });
          messagesRef.current = next;
          scheduleSave(next);
          return next;
        });
        if (resumeKind) setCanResume(resumeKind);
        else setCanResume(false);
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
    suppressLiveRef.current = true;
    const id = targetMsgId.current;
 // 先同步收敛 messagesRef（pending=false），再掐 target，避免迟到事件按 pending 重挂
    if (id) {
      const next = messagesRef.current.map((m) => {
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
 // 流末 usage 常随中断丢失：用未入账正文 / 思考粗估
    // 先收束活动工具 / 子代理 Task，再挂「已停止」
        const frozen = deactivateAll(
          pickRicherTimeline(timelineRef.current, withClock.timeline),
        );
        const failed = failAssistantMessage(
          withUnbilledUsageEstimate({
            ...withClock,
            text: streamText.current || withClock.text,
          }),
          t("chat.stopped"),
          frozen,
          "CANCELLED",
        );
        return failed;
      });
      messagesRef.current = next;
      const failedMsg = next.find((m) => m.id === id);
      timelineRef.current = failedMsg?.timeline ?? [];
      setMessages(next);
      scheduleSave(next);
    } else {
      resetUnbilled();
    }
    targetMsgId.current = null;
    void cancelAgent(activeRunId.current ?? undefined);
    setBusy(false);
    // 手动停止：时间线可「继续」，输入区不弹检查点横幅
    setCanResume("cancelled");
    activeRunId.current = null;
    streamText.current = "";
    if (raf.current != null) {
      window.cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key !== "Enter") return;
 // Shift+Enter：换行；Enter：发送
    if (e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
      return;
    }
    e.preventDefault();
    if (busy) return;
    void send();
  }

  /**
   * 点击已发送的用户消息：原位进入编辑，历史不动；发送时才从该条截断。   */
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
      const len = el.getValue().length;
      el.setSelectionRange(len, len);
    });
  }

  function onEditKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      e.preventDefault();
      clearUserEdit();
      return;
    }
    if (e.key !== "Enter") return;
    if (e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
      return;
    }
    e.preventDefault();
    const id = editingUserIdRef.current;
    if (!id) return;
    void send(editDraftRef.current, id);
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
      // 已超时：清缓存，不可再恢
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
    /** 递增以强制聊天舞台贴底（配合 ChatStage）*/
    stickNonce,
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
    /** 门禁「打开」：选目录建工作空间并进入新会话*/
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
    /** 其它会话仍在跑的数量（侧栏 / 后台指示） */
    backgroundRunCount: listBusyLiveRuns().filter((s) => s.sessionId !== sessionId).length,
  };
}
