/**
 * 聊天会话编排核心：组合 runState / persistence / eventStream / queue / edit 五个 Hook，
 * 并保留会话选择、工作空间、发送 / 续跑等编排逻辑。
 *
 * 拆分约束（对外契约）：
 * - 返回对象的字段名与形状逐字保持不变（App.tsx 是唯一调用方）
 * - 消息写路径全部经 run.commitMessages（setMessages + ref 同步 + 防抖落库三者不可分）
 */

import {
  type ChatAttachmentRef,
  type ChatImageRef,
  type ChatMessage,
  createTraceId,
  type GeneralSettings,
} from "@thinker-workbench/shared";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  cancelAgent,
  GENERAL_SETTINGS_CHANGED,
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
  saveAttachment,
  setActiveSession,
  setLastWorkspaceId,
} from "../../bridge/workspaces";
import { useT } from "../../i18n/useI18n";
import { appLog } from "../../log/sessionLog";
import { useEnsureModelSecrets, useShowModelSecretGate } from "../modelSecrets/ModelSecretGate";
import type { ComposerEditorHandle } from "./ComposerEditor";
import { chatSubmitBlocked } from "./chatSubmit";
import {
  extractAttachmentIds,
  extractContextPaths,
  formatFileAttachment,
} from "./composerMentions";
import {
  ensureLiveRunRegistry,
  listBusyLiveRuns,
  markLiveRunStopping,
  mergeDbWithLiveSlot,
  parkForegroundRun,
  setForegroundSessionId,
  subscribeLiveRuns,
  takeLiveRunSlot,
  upsertLiveRunSlot,
} from "./liveRunRegistry";
import { PREVIEW_BODY_CHARS, withTextPreview } from "./logPreview";
import { finishMessageClock, localElapsedMs, settleLoadedMessages } from "./messageClock";
import { createMessage, failAssistantMessage, toAgentHistory } from "./messageModel";
import { classifyRunError, isSoftStopCode, softStopResumeKind } from "./runErrors";
import { isUnlockDeniedError } from "./systemErrors";
import {
  appendError,
  deactivateAll,
  isDeleteRestoreExpired,
  pickRicherTimeline,
  pruneExpiredDeleteRestoreCaches,
  QUEUED_WAIT_STEP_ID,
  readDeleteFileRestoreTtlDays,
  withQueuedWait,
} from "./timelineModel";
import { useChatEventStream } from "./useChatEventStream";
import { useChatMessageEdit } from "./useChatMessageEdit";
import { useChatPersistence } from "./useChatPersistence";
import { useChatRunQueue } from "./useChatRunQueue";
import { useChatRunState } from "./useChatRunState";
import type { WorkspaceGate } from "./useDraftImages";

/** 续跑前可丢掉的空壳错误助手气泡。 */
function isResumeStubMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.text?.trim()) return false;
  const steps = message.timeline ?? [];
  return steps.length > 0 && steps.every((s) => s.kind === "error");
}

/** 从会话 runStatus 推导 Resume 种类*/
function resumeKindFromRunStatus(runStatus: string | undefined): null | "cancelled" | "crashed" {
  if (runStatus === "crashed") return "crashed";
  if (runStatus === "cancelled") return "cancelled";
  return null;
}

/**
 * @param visible 聊天页是否在前台。离开再回来时用于立刻刷 token 并滚到底。
 */
export function useChatSession(visible = true) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>();
  /** 当前侧栏 / 输入框展示的工作空间（可与活动会话同步）*/
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const workspaceIdRef = useRef<string | null>(null);
  /** 发送前缺少工作空间 / 会话时的门禁（显示在输入框上方）*/
  const [workspaceGate, setWorkspaceGate] = useState<WorkspaceGate>(null);
  /** 草稿外部附件：上传 / 粘贴 / 拖入的落盘引用；发送时按文本中的 @file:<id> 收口。 */
  const [draftAttachments, setDraftAttachments] = useState<ChatAttachmentRef[]>([]);
  const draftAttachmentsRef = useRef<ChatAttachmentRef[]>(draftAttachments);
  useEffect(() => {
    draftAttachmentsRef.current = draftAttachments;
  }, [draftAttachments]);
  const clearDraftAttachments = useCallback(() => setDraftAttachments([]), []);
  const attachFiles = useCallback(
    async (files: File[]) => {
      if (!workspaceId) return;
      const refs: ChatAttachmentRef[] = [];
      for (const f of files) {
        try {
          const bytes = new Uint8Array(await f.arrayBuffer());
          const ref = await saveAttachment(workspaceId, {
            bytes,
            mime: f.type || "application/octet-stream",
            name: f.name,
          });
          refs.push(ref);
        } catch (err) {
          console.error("attachFiles failed", err);
        }
      }
      if (refs.length === 0) return;
      setDraftAttachments((prev) => [...prev, ...refs]);
      const insertText = refs.map((r) => formatFileAttachment(r.id)).join("");
      // 直接追加：@file: 解析已放宽，可紧接前文（无前导空格）成芯片
      setDraft((prev) => prev + insertText);
    },
    [workspaceId],
  );
  const removeAttachment = useCallback((id: string) => {
    setDraftAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);
  /** 草稿文本变化：回收未被 @file: 引用的资产（删除芯片即移除资产）。 */
  const reconcileDraftAttachments = useCallback((text: string) => {
    setDraft(text);
    const ids = new Set(extractAttachmentIds(text));
    setDraftAttachments((prev) => prev.filter((a) => ids.has(a.id)));
  }, []);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  /** cancelled：仅时间线可续；crashed：输入区也提示检查点续跑*/
  const [resumeKind, setResumeKind] = useState<null | "cancelled" | "crashed">(null);
  const canResume = resumeKind != null;
  const setCanResume = (v: boolean | "cancelled" | "crashed") => {
    if (v === false) setResumeKind(null);
    else if (v === true) setResumeKind("cancelled");
    else setResumeKind(v);
  };
  const ensureModelSecrets = useEnsureModelSecrets();
  const showModelSecretGate = useShowModelSecretGate();
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
  const submittingRef = useRef(false);

  // —— 状态核心与特性 Hook（消息 / 直播 ref / 排队 / 编辑 / 落库 / 事件流）——
  // send / applyLoadedSession 为函数声明（提升），在此处传入时已可用；它们只在渲染后
  // 的事件回调里被调用，闭包引用的各 Hook 返回值届时均已初始化。
  const run = useChatRunState();
  const queue = useChatRunQueue(run, { setBusy, setCanResume, setThreadId, t });
  const persistence = useChatPersistence(run, { applyLoadedSession });
  const edit = useChatMessageEdit(run, {
    send,
    busy,
    queued: queue.queued,
    workspaceId,
  });
  useChatEventStream(run, {
    threadId,
    setBusy,
    setCanResume,
    setThreadId,
    queue: {
      queuedRef: queue.queuedRef,
      setQueuedState: queue.setQueuedState,
      promoteQueuedUi: queue.promoteQueuedUi,
    },
    reloadCurrentSessionFromDb: persistence.reloadCurrentSessionFromDb,
  });

  const empty = run.messages.length === 0;

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
    run.commitMessages(settled, { persist: false });
    setCanResume(resumeKindFromRunStatus(runStatus) ?? false);

    const pending = [...settled].reverse().find((m) => m.role === "assistant" && m.pending);
    if (runStatus === "queued") {
      setBusy(false);
      queue.setQueuedState(true);
      setCanResume(false);
      if (pending) {
        run.targetMsgIdRef.current = pending.id;
        run.streamTextRef.current = "";
        const timeline = pending.timeline?.some((step) => step.id === QUEUED_WAIT_STEP_ID)
          ? [...(pending.timeline ?? [])]
          : withQueuedWait(pending.timeline ?? [], t("chat.queuedUnknown"));
        run.timelineRef.current = timeline;
        run.activeRunIdRef.current = opts?.activeRunId ?? run.activeRunIdRef.current;
        if (timeline !== pending.timeline) {
          run.commitMessages(
            settled.map((m) => (m.id === pending.id ? { ...m, pending: true, timeline } : m)),
            { persist: false },
          );
        }
      }
      return;
    }
    queue.setQueuedState(false);
    if (runStatus === "running" && pending) {
      run.targetMsgIdRef.current = pending.id;
      run.streamTextRef.current = pending.text || "";
      run.timelineRef.current = [...(pending.timeline ?? [])];
      run.activeRunIdRef.current = opts?.activeRunId ?? run.activeRunIdRef.current;
      setBusy(true);
      setCanResume(false);
      // 进行中勿把半截快照再次落库，防止盖住主进程 finalize
      return;
    }

    // running 但无 pending，或已终态：必须清 busy，避免空会话锁死发送钮
    setBusy(false);
    if (runStatus !== "running") {
      // 把冻结后的耗时写回，避免旧 startedAt 下次刷新再被墙钟拉长
      run.scheduleSave(settled);
    }
  }

  /** 同步工作空间展示名与根路径；别名变更时刷新*/
  const syncWorkspaceLabel = useCallback(async (id: string | null) => {
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
  }, []);

  /**
   * 侧栏删除会话 / 清空工作空间后：DB 已无当前会话，但主区仍可能挂着内存消息。
   * 监听 threads 变更，若当前会话已不存在则切到同空间最近会话或清空主区。
   */
  async function reconcileIfSessionGone() {
    const sid = run.sessionIdRef.current;
    if (!sid) return;
    const loaded = await getSession(sid);
    if (loaded) return;
    // 用户可能已切到别的会
    if (run.sessionIdRef.current !== sid) return;

    // 会话已删：取消未落库的 save，避免 saveMessages 报 Session not found / 写回幽灵数据
    run.cancelSave(sid);
    run.runEpoch.bump();
    run.sessionEpoch.bump();
    const runId = run.activeRunIdRef.current;
    run.activeRunIdRef.current = null;
    run.targetMsgIdRef.current = null;
    run.streamTextRef.current = "";
    run.timelineRef.current = [];
    if (runId || sid) {
      void cancelAgent({
        ...(runId ? { runId } : {}),
        sessionId: sid,
      });
    }
    setBusy(false);
    setCanResume(false);
    edit.clearUserEdit();
    setDraft("");
    clearDraftAttachments();
    setWorkspaceGate(null);
    setActiveTraceId(null);

    const wid = workspaceIdRef.current ?? (await getLastWorkspaceId());
    if (wid) {
      const workspaces = await listWorkspaces();
      if (workspaces.some((w) => w.id === wid)) {
        // 再次确认仍停在已删会话上（避免覆盖用户新选择：
        if (run.sessionIdRef.current !== sid && run.sessionIdRef.current != null) return;
        const sessions = await listSessions(wid);
        const latest = sessions[0];
        if (latest) {
          const next = await getSession(latest.id);
          if (run.sessionIdRef.current !== sid && run.sessionIdRef.current != null) return;
          setSessionId(latest.id);
          run.sessionIdRef.current = latest.id;
          setThreadId(latest.threadId);
          await setActiveSession(latest.id);
          await syncWorkspaceLabel(wid);
          applyLoadedSession(next?.session.runStatus, next?.messages ?? [], {
            activeRunId: next?.session.activeRunId,
          });
          return;
        }
        setSessionId(null);
        run.sessionIdRef.current = null;
        setThreadId(undefined);
        await setActiveSession(null);
        run.commitMessages([]);
        await syncWorkspaceLabel(wid);
        return;
      }
    }

    if (run.sessionIdRef.current !== sid && run.sessionIdRef.current != null) return;
    setSessionId(null);
    run.sessionIdRef.current = null;
    setThreadId(undefined);
    await setActiveSession(null);
    run.commitMessages([]);
    await syncWorkspaceLabel(null);
  }

  // 启动：恢复上次会话；否则恢复上次工作空间（及其最近会话）；再否则默认工作空间
  // biome-ignore lint/correctness/useExhaustiveDependencies: 挂载时恢复一次即可；回调内部只读 ref 与稳定 setter
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
          run.sessionEpoch.bump();
          run.sessionIdRef.current = loaded.session.id;
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
      const ws = workspaces.find((w) => w.id === lastWsId) ?? workspaces[0] ?? null;
      if (!ws || cancelled) return;
      await setLastWorkspaceId(ws.id);
      await syncWorkspaceLabel(ws.id);

      const sessions = await listSessions(ws.id);
      if (cancelled) return;
      const latest = sessions[0];
      if (!latest) return;
      run.sessionEpoch.bump();
      const loaded = await getSession(latest.id);
      if (cancelled || !loaded) return;
      run.sessionIdRef.current = loaded.session.id;
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
    // 只在挂载时恢复。放进依赖会反复重载会话并强制贴底。
  }, []);

  // 别名等变更时刷新输入框工作空间名
  useEffect(() => {
    if (!workspaceId) return;
    return onWorkspacesChanged(() => {
      void syncWorkspaceLabel(workspaceId);
    });
  }, [workspaceId, syncWorkspaceLabel]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 依赖故意列入以保持每次渲染都是最新闭包；biome 对不稳定引用的提示在此不适用
  useEffect(() => {
    ensureLiveRunRegistry();
    return onThreadsChanged(() => {
      void reconcileIfSessionGone();
      // 主进程 finalize 后拉终态（刷新期间错过 done 事件时）
      void persistence.reloadCurrentSessionFromDb();
      queue.syncQueueRef.current();
    });
    // 仅挂载订阅；逻辑走 ref
    // biome-ignore lint/correctness/useExhaustiveDependencies: 依赖故意列入以保持每次渲染都是最新闭包；biome 对不稳定引用的提示在此不适用
  }, [persistence.reloadCurrentSessionFromDb, reconcileIfSessionGone]);

  useEffect(() => {
    setForegroundSessionId(sessionId);
  }, [sessionId]);

  useEffect(() => {
    run.sessionIdRef.current = sessionId;
  }, [sessionId, run.sessionIdRef]);

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  // hydrate / 切会话后顺带清掉已过期的恢复缓存
  useEffect(() => {
    const ttl = readDeleteFileRestoreTtlDays();
    const pruned = pruneExpiredDeleteRestoreCaches(run.messages, ttl);
    if (pruned === run.messages) return;
    run.commitMessages(pruned);
  }, [run.messages, run.commitMessages]);

  useEffect(() => {
    function prune() {
      const ttl = readDeleteFileRestoreTtlDays();
      const next = pruneExpiredDeleteRestoreCaches(run.messagesRef.current, ttl);
      if (next === run.messagesRef.current) return;
      run.commitMessages(next);
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
  }, [run.commitMessages, run.messagesRef]);

  const [liveRunTick, setLiveRunTick] = useState(0);
  useEffect(() => {
    return subscribeLiveRuns(() => setLiveRunTick((n) => n + 1));
  }, []);
  const _backgroundRunCount = listBusyLiveRuns().filter((s) => s.sessionId !== sessionId).length;
  void liveRunTick;

  // 回到聊天页：冲掉未刷完的流式帧；不强制滚底（尊重用户阅读位置：
  useEffect(() => {
    if (!visible) return;
    if (run.rafRef.current != null) {
      window.cancelAnimationFrame(run.rafRef.current);
      run.rafRef.current = null;
      run.flushStreamRef.current?.();
    }
  }, [visible, run.rafRef, run.flushStreamRef]);

  useEffect(() => {
    if (!visible) return;
    inputRef.current?.focus();
  }, [visible]);

  /** 掐断当前运行但不改消息（原位重发前用，历史由截断覆盖）*/
  function abortRunSilently() {
    run.runEpoch.bump();
    const sid = run.sessionIdRef.current;
    const runId = run.activeRunIdRef.current ?? undefined;
    run.targetMsgIdRef.current = null;
    void cancelAgent({
      ...(runId ? { runId } : {}),
      ...(sid ? { sessionId: sid } : {}),
    });
    run.activeRunIdRef.current = null;
    run.streamTextRef.current = "";
    run.timelineRef.current = [];
    if (run.rafRef.current != null) {
      window.cancelAnimationFrame(run.rafRef.current);
      run.rafRef.current = null;
    }
    setBusy(false);
    setCanResume(false);
    queue.setQueuedState(false);
  }

  /**
   * 切换到指定会话：切换是视图操作，不取消后台 run。
   * 先等齐数据，再在同一同步段里改 sessionId / messages / busy，避免 await 间隙闪一下进行中动画。
   */
  async function selectSession(nextSessionId: string, nextThreadId: string) {
    // 同会话：DB 与未结算槽合并，勿用旧快照盖掉流式尾部
    if (nextSessionId === run.sessionIdRef.current) {
      const loaded = await getSession(nextSessionId);
      const dbMessages = loaded?.messages ?? [];
      const merged = mergeDbWithLiveSlot(nextSessionId, dbMessages) ?? dbMessages;
      const live = takeLiveRunSlot(nextSessionId);
      applyLoadedSession(loaded?.session.runStatus, merged, {
        activeRunId: live?.runId ?? loaded?.session.activeRunId,
      });
      if (live?.busy) {
        queue.setQueuedState(false);
        setBusy(true);
        run.streamTextRef.current = live.streamText;
        run.timelineRef.current = live.timeline;
        run.targetMsgIdRef.current = live.targetMsgId;
        run.activeRunIdRef.current = live.runId;
      } else if (loaded?.session.runStatus === "queued") {
        void queue.syncQueueFromDb();
      }
      requestStickToBottom();
      return;
    }

    // 封存当前前台流式态到 LiveRunRegistry，供后台继续
    const prevSid = run.sessionIdRef.current;
    const prevTid = threadId;
    if (prevSid && prevTid && (busy || run.activeRunIdRef.current)) {
      parkForegroundRun({
        sessionId: prevSid,
        threadId: prevTid,
        runId: run.activeRunIdRef.current,
        messages: run.messagesRef.current,
        streamText: run.streamTextRef.current,
        timeline: run.timelineRef.current,
        targetMsgId: run.targetMsgIdRef.current,
        busy,
      });
    }

    await persistence.flushSave();
    const loaded = await getSession(nextSessionId);

    // —— 以下为同步 UI 切换：中间不可 await ——
    run.cancelPendingStreamFlush();
    run.sessionEpoch.bump();
    run.suppressLiveRef.current = false;
    run.sessionIdRef.current = nextSessionId;
    setSessionId(nextSessionId);
    setForegroundSessionId(nextSessionId);
    setThreadId(nextThreadId);

    const live = takeLiveRunSlot(nextSessionId);
    if (live?.busy) {
      run.commitMessages(live.messages, { persist: false });
      run.activeRunIdRef.current = live.runId;
      run.targetMsgIdRef.current = live.targetMsgId;
      run.streamTextRef.current = live.streamText;
      run.timelineRef.current = live.timeline;
      queue.setQueuedState(false);
      setBusy(true);
      setCanResume(false);
    } else {
      run.activeRunIdRef.current = null;
      run.targetMsgIdRef.current = null;
      run.streamTextRef.current = "";
      run.timelineRef.current = [];
      applyLoadedSession(loaded?.session.runStatus, loaded?.messages ?? [], {
        activeRunId: loaded?.session.activeRunId,
      });
      if (loaded?.session.runStatus !== "running") {
        setBusy(false);
      }
      if (loaded?.session.runStatus === "queued") {
        void queue.syncQueueFromDb();
      }
    }
    setWorkspaceGate(null);
    edit.clearUserEdit();
    setDraft("");
    clearDraftAttachments();
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
    if (busy && run.sessionIdRef.current && threadId) {
      parkForegroundRun({
        sessionId: run.sessionIdRef.current,
        threadId,
        runId: run.activeRunIdRef.current,
        messages: run.messagesRef.current,
        streamText: run.streamTextRef.current,
        timeline: run.timelineRef.current,
        targetMsgId: run.targetMsgIdRef.current,
        busy: true,
      });
    }
    await persistence.flushSave();
    const loaded = await getSession(nextSessionId);

    run.cancelPendingStreamFlush();
    run.sessionEpoch.bump();
    run.sessionIdRef.current = nextSessionId;
    setSessionId(nextSessionId);
    setForegroundSessionId(nextSessionId);
    setThreadId(nextThreadId);
    run.commitMessages([]);
    setBusy(false);
    setCanResume(false);
    setWorkspaceGate(null);
    edit.clearUserEdit();
    setDraft("");
    clearDraftAttachments();
    run.activeRunIdRef.current = null;
    run.targetMsgIdRef.current = null;
    run.streamTextRef.current = "";
    run.timelineRef.current = [];
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

    await persistence.flushSave();

    run.cancelPendingStreamFlush();
    run.sessionEpoch.bump();
    run.sessionIdRef.current = null;
    setSessionId(null);
    setThreadId(undefined);
    run.commitMessages([]);
    setBusy(false);
    setCanResume(false);
    setWorkspaceGate(null);
    edit.clearUserEdit();
    setDraft("");
    clearDraftAttachments();
    run.activeRunIdRef.current = null;
    run.targetMsgIdRef.current = null;
    run.streamTextRef.current = "";
    run.timelineRef.current = [];
    requestStickToBottom();

    await setActiveSession(null);
  }

  /**
   * @param override 快捷方式 / 原位编辑的正文。
   * @param replaceUserId 从该用户消息截断后重发；未传则追加到末尾。
   */
  async function send(override?: string, replaceUserId?: string | null) {
    const text = (override ?? draft).trim();
    // 进行中或排队：允许改草稿 / 模式 / 附图，但不能再提交
    if (chatSubmitBlocked(busy, queue.queuedRef.current)) return;
    let sendImages: ChatImageRef[] = [];
    // 统一资产：底部与编辑态都走 @file: 芯片；编辑态资产在 edit.editAttachments
    const assetSource = replaceUserId
      ? edit.editAttachmentsRef.current
      : draftAttachmentsRef.current;
    const referencedAttIds = new Set(extractAttachmentIds(text));
    const draftAtts = assetSource.filter((a) => referencedAttIds.has(a.id));
    // 图片类附件走 image_ref 视觉通道（不进 <context_files> 文本解析）；其余为文档附件
    const imageAtts = draftAtts.filter((a) => a.mime.startsWith("image/"));
    const sendAttachments = draftAtts.filter((a) => !a.mime.startsWith("image/"));
    sendImages = [
      ...sendImages,
      ...imageAtts.map((a) => ({ id: a.id, path: a.path, mime: a.mime, width: 0, height: 0 })),
    ];
    if (!text && sendImages.length === 0 && draftAtts.length === 0) return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    // 先解锁钥匙串；仅「拒绝授权」弹窗并中止。未配置密钥不拦截，走气泡内既有引导。
    if (!(await ensureModelSecrets())) {
      submittingRef.current = false;
      return;
    }

    // 必须有活动会话所属的工作空间；有工作空间无会话时自动建会话
    // getSession 返回 { session, messages }，工作空间在 session.workspaceId
    let sid = sessionId ?? (await getActiveSessionId());
    const sess = sid ? await getSession(sid) : null;
    let runThreadId = sess?.session.threadId ?? threadId;
    if (!sess?.session.workspaceId) {
      let wid = workspaceId ?? (await getLastWorkspaceId());
      if (!wid) {
        const workspaces = await listWorkspaces();
        wid = workspaces[0]?.id ?? null;
      }
      if (!wid) {
        setWorkspaceGate({ kind: "no-workspace", message: t("chat.noWorkspace") });
        submittingRef.current = false;
        return;
      }
      const created = await createSession(wid);
      sid = created.id;
      runThreadId = created.threadId;
      // 勿 bump sessionEpoch：会丢掉本轮即将到来的 agent 事件，导致气泡不更新、busy 卡住
      // 立刻挂上 ref，避免随后 threadsChanged 重载时仍指向旧会话
      run.sessionIdRef.current = created.id;
      setSessionId(created.id);
      setThreadId(created.threadId);
      await setActiveSession(created.id);
      await setLastWorkspaceId(wid);
      await syncWorkspaceLabel(wid);
    }
    setWorkspaceGate(null);

    if (replaceUserId) {
      abortRunSilently();
      const idx = run.messagesRef.current.findIndex((m) => m.id === replaceUserId);
      if (idx >= 0) {
        run.commitMessages(run.messagesRef.current.slice(0, idx), { persist: false });
      }
    }
    edit.clearUserEdit();
    setDraft("");
    clearDraftAttachments();
    setCanResume(false);
    const traceId = createTraceId();
    setActiveTraceId(traceId);
    const log = appLog("chat.send");
    log.info("submit", {
      traceId,
      threadId: runThreadId,
      meta: {
        ...withTextPreview(text || "(image)", "message", PREVIEW_BODY_CHARS),
        imageCount: sendImages.length,
      },
    });

    const userMsg = createMessage(
      "user",
      text,
      false,
      undefined,
      sendImages.length > 0 ? sendImages : undefined,
      draftAtts.length > 0 ? draftAtts : undefined,
    );
    const pending: ChatMessage = {
      ...createMessage("assistant", "", true, []),
      runStartedAt: Date.now(),
      traceId,
    };
    // 在追加本轮气泡之前快照历史，避免把当前 user / 空助手也塞进模型上下文
    const history = toAgentHistory(run.messagesRef.current);
    run.suppressLiveRef.current = false;
    run.targetMsgIdRef.current = pending.id;
    run.activeRunIdRef.current = null;
    run.streamTextRef.current = "";
    run.timelineRef.current = [];
    if (run.rafRef.current != null) {
      window.cancelAnimationFrame(run.rafRef.current);
      run.rafRef.current = null;
    }
    run.runEpoch.bump();
    const epoch = run.runEpoch.capture();
    run.commitMessages((prev) => [...prev, userMsg, pending]);
    requestStickToBottom();
    try {
      const contextPaths = extractContextPaths(text);
      const result = await runAgent({
        message: text,
        history,
        threadId: runThreadId,
        sessionId: sid ?? undefined,
        traceId,
        ...(sendImages.length > 0 ? { images: sendImages } : {}),
        ...(contextPaths.length > 0 ? { contextPaths } : {}),
        ...(sendAttachments.length > 0 ? { attachments: sendAttachments } : {}),
      });
      if (run.runEpoch.isStale(epoch)) return;
      if (result.ok && result.runId) {
        run.activeRunIdRef.current = result.runId;
        if (result.queued) {
          const pos = result.queuePosition ?? 1;
          queue.noteQueuePosition(pos);
          queue.setQueuedState(true);
          setBusy(false);
          run.timelineRef.current = withQueuedWait([], t("chat.queued", { position: String(pos) }));
          run.commitMessages(
            (prev) =>
              prev.map((m) =>
                m.id === pending.id
                  ? { ...m, pending: true, timeline: [...run.timelineRef.current] }
                  : m,
              ),
            { persist: false },
          );
          if (sid) {
            upsertLiveRunSlot({
              sessionId: sid,
              threadId: result.threadId || runThreadId || "",
              runId: result.runId,
              messages: run.messagesRef.current,
              targetMsgId: pending.id,
              busy: false,
              streamText: "",
              timeline: run.timelineRef.current,
            });
          }
          if (result.threadId) setThreadId(result.threadId);
          await persistence.flushSave();
          return;
        }
        queue.setQueuedState(false);
        setBusy(true);
        if (sid) {
          upsertLiveRunSlot({
            sessionId: sid,
            threadId: result.threadId || runThreadId || "",
            runId: result.runId,
            messages: run.messagesRef.current,
            targetMsgId: pending.id,
            busy: true,
            streamText: run.streamTextRef.current,
            timeline: run.timelineRef.current,
          });
        }
        if (result.threadId) setThreadId(result.threadId);
        log.info("accepted", {
          traceId,
          runId: result.runId,
          threadId: result.threadId,
        });
        // 终态只经 AgentEvent；勿在此二次改写气泡
        await persistence.flushSave();
        return;
      }

      log.info("result error", {
        traceId,
        runId: result.runId,
        threadId: result.threadId,
        meta: { error: result.ok ? "" : result.error },
      });

      // 钥匙串拒绝兜底：撤回本轮气泡、恢复草稿、弹自定义窗
      if (!result.ok && isUnlockDeniedError(result.error || "")) {
        run.commitMessages((prev) =>
          prev.filter((m) => m.id !== userMsg.id && m.id !== pending.id),
        );
        setDraft(text);
        showModelSecretGate();
        run.activeRunIdRef.current = null;
        run.targetMsgIdRef.current = null;
        setBusy(false);
        inputRef.current?.focus();
        return;
      }

      // 准入 / 派发前失败：本地收束（账本可能已 emit error，此处兜底）
      const errText = result.ok ? "Unknown error" : result.error || "Unknown error";
      run.commitMessages((prev) =>
        prev.map((m) => {
          if (m.id !== pending.id) return m;
          const errCode = classifyRunError(errText);
          const display =
            errCode === "PROCESS_EXIT"
              ? "Exited unexpectedly."
              : errCode === "CANCELLED"
                ? "Stopped."
                : errText;
          // 引擎未参与：只有本地墙钟可测（不是推断），拿不到就留「—」
          const elapsed = localElapsedMs(m);
          // 用量：引擎没跑过就没有用量可言，保持未知（「—」），绝不粗估
          const failed = failAssistantMessage(
            { ...m, text: run.streamTextRef.current || m.text },
            display,
            pickRicherTimeline(run.timelineRef.current, m.timeline),
            errCode,
            elapsed,
          );
          run.timelineRef.current = failed.timeline ?? [];
          return failed;
        }),
      );
      {
        const resume = softStopResumeKind(errText);
        if (resume) setCanResume(resume);
      }
      run.activeRunIdRef.current = null;
      run.targetMsgIdRef.current = null;
      setBusy(false);
    } catch (err) {
      if (run.runEpoch.isStale(epoch)) return;
      const msg = err instanceof Error ? err.message : String(err);
      log.error("result throw", { traceId, meta: { error: msg } });
      run.commitMessages((prev) =>
        prev.map((m) => {
          if (m.id !== pending.id) return m;
          const errCode = classifyRunError(msg);
          const display =
            errCode === "PROCESS_EXIT"
              ? "Exited unexpectedly."
              : errCode === "CANCELLED"
                ? "Stopped."
                : msg;
          // 引擎未参与：没有用量可言，保持未知（「—」），绝不粗估
          const failed = failAssistantMessage(
            { ...m, text: run.streamTextRef.current || m.text },
            display,
            pickRicherTimeline(run.timelineRef.current, m.timeline),
            errCode,
            localElapsedMs(m),
          );
          run.timelineRef.current = failed.timeline ?? [];
          return failed;
        }),
      );
      {
        const resume = softStopResumeKind(msg);
        if (resume) setCanResume(resume);
      }
      run.activeRunIdRef.current = null;
      run.targetMsgIdRef.current = null;
      setBusy(false);
    } finally {
      submittingRef.current = false;
      if (run.rafRef.current != null) {
        window.cancelAnimationFrame(run.rafRef.current);
        run.rafRef.current = null;
      }
    }
  }

  async function resume() {
    if (!threadId || busy || queue.queuedRef.current) return;

    if (!(await ensureModelSecrets())) return;

    // 续写原先那条助手消息：丢掉末尾空壳错误气泡，再取最后一条 assistant
    let base = [...run.messagesRef.current];
    while (base.length > 0) {
      const last = base[base.length - 1];
      if (!last) break;
      if (last.role === "assistant" && isResumeStubMessage(last)) {
        base = base.slice(0, -1);
        continue;
      }
      break;
    }
    const existing = [...base].reverse().find((m) => m.role === "assistant");
    if (!existing) return;

    setCanResume(false);
    run.suppressLiveRef.current = false;
    requestStickToBottom();

    const traceId = createTraceId();
    setActiveTraceId(traceId);
    run.activeRunIdRef.current = null;

    // 崩溃前最后一条不是这条 assistant（例如用户已发出新消息、回复还没产生）：
    // 续跑属于新一轮，要新建 pending 助手气泡挂在末尾；
    // 否则「思考中」会写进上一条助手气泡，显示到新用户消息的上面去。
    const lastMsg = base[base.length - 1];
    let pendingId = existing.id;
    if (lastMsg?.role !== "assistant" || lastMsg.id !== existing.id) {
      const fresh: ChatMessage = {
        ...createMessage("assistant", "", true, []),
        runStartedAt: Date.now(),
        traceId,
      };
      pendingId = fresh.id;
      run.targetMsgIdRef.current = fresh.id;
      run.streamTextRef.current = "";
      run.timelineRef.current = [];
      run.commitMessages(() => [...base, fresh]);
    } else {
      run.targetMsgIdRef.current = existing.id;
      run.streamTextRef.current = existing.text || "";
      // 清掉上次失败残留的 error 步，保留已有正文 / 工具时间线
      run.timelineRef.current = deactivateAll(
        (existing.timeline ?? []).filter((s) => s.kind !== "error"),
      );
      run.commitMessages(() =>
        base.map((m) =>
          m.id === pendingId
            ? {
                ...m,
                timeline: [...run.timelineRef.current],
                pending: true,
                runStartedAt: Date.now(),
                traceId,
              }
            : m,
        ),
      );
    }

    run.runEpoch.bump();
    const epoch = run.runEpoch.capture();
    const sid = run.sessionIdRef.current;
    try {
      const result = await resumeAgent({
        threadId,
        traceId,
        sessionId: sid ?? undefined,
      });
      if (run.runEpoch.isStale(epoch)) return;
      if (result.ok && result.runId) {
        run.activeRunIdRef.current = result.runId;
        if (result.queued) {
          const pos = result.queuePosition ?? 1;
          queue.noteQueuePosition(pos);
          queue.setQueuedState(true);
          setBusy(false);
          run.timelineRef.current = withQueuedWait(
            run.timelineRef.current,
            t("chat.queued", { position: String(pos) }),
          );
          run.commitMessages(
            (prev) =>
              prev.map((m) =>
                m.id === pendingId
                  ? { ...m, pending: true, timeline: [...run.timelineRef.current] }
                  : m,
              ),
            { persist: false },
          );
          if (sid) {
            upsertLiveRunSlot({
              sessionId: sid,
              threadId,
              runId: result.runId,
              messages: run.messagesRef.current,
              targetMsgId: pendingId,
              busy: false,
              streamText: run.streamTextRef.current,
              timeline: run.timelineRef.current,
            });
          }
          return;
        }
        setBusy(true);
        if (sid) {
          upsertLiveRunSlot({
            sessionId: sid,
            threadId,
            runId: result.runId,
            messages: run.messagesRef.current,
            targetMsgId: pendingId,
            busy: true,
            streamText: run.streamTextRef.current,
            timeline: run.timelineRef.current,
          });
        }
        // 终态只经 AgentEvent
        return;
      }
      const errText = result.ok ? "Resume failed." : result.error || "Resume failed.";
      const noCheckpoint = /no checkpoint/i.test(errText);
      const resumeKind = noCheckpoint ? null : softStopResumeKind(errText);
      const crashed = resumeKind === "crashed";
      run.commitMessages((prev) =>
        prev.map((m) => {
          if (m.id !== pendingId) return m;
          if (crashed) {
            let timeline = deactivateAll(pickRicherTimeline(run.timelineRef.current, m.timeline));
            if (!timeline.some((s) => s.kind === "error" && isSoftStopCode(s.code))) {
              timeline = appendError(timeline, "Exited unexpectedly.", "PROCESS_EXIT");
            }
            run.timelineRef.current = timeline;
            return finishMessageClock(
              {
                ...m,
                pending: true,
                text: run.streamTextRef.current || m.text,
                timeline,
              },
              localElapsedMs(m),
            );
          }
          const errCode = classifyRunError(errText);
          const display = noCheckpoint
            ? errText
            : errCode === "PROCESS_EXIT"
              ? "Exited unexpectedly."
              : errCode === "CANCELLED"
                ? "Stopped."
                : errText;
          // 引擎未参与：没有用量可言，保持未知（「—」），绝不粗估
          const failed = failAssistantMessage(
            { ...m, text: run.streamTextRef.current || m.text },
            display,
            pickRicherTimeline(run.timelineRef.current, m.timeline),
            errCode,
            localElapsedMs(m),
          );
          run.timelineRef.current = failed.timeline ?? [];
          return failed;
        }),
      );
      if (resumeKind) setCanResume(resumeKind);
      else setCanResume(false);
      run.activeRunIdRef.current = null;
      run.targetMsgIdRef.current = null;
      setBusy(false);
    } finally {
      /* 成功路径保持 busy，等 done/error */
    }
  }

  function cancel() {
    if (!busy && !queue.queuedRef.current) return;
    const sid = run.sessionIdRef.current;
    const runId = run.activeRunIdRef.current ?? undefined;
    // 只标「正在停止」；排队项没有流式过程，不走 stopping
    if (busy && sid) markLiveRunStopping(sid);
    void cancelAgent({
      ...(runId ? { runId } : {}),
      ...(sid ? { sessionId: sid } : {}),
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    // Shift+Enter 换行由 ComposerEditor 处理；Enter 发送
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (chatSubmitBlocked(busy, queue.queued)) return;
    void send();
  }

  /**
   * 时间线 delete_file「恢复」：把删前缓存的正文写回工作区，并标记 restored。
   * 失败时抛错，供卡片展示提示。
   */
  async function restoreDeletedFile(messageId: string, stepId: string) {
    const wid = workspaceId;
    if (!wid) throw new Error(t("chat.noWorkspaceLabel"));
    const msg = run.messagesRef.current.find((m) => m.id === messageId);
    const step = msg?.timeline?.find((s) => s.id === stepId);
    if (step?.kind !== "tool" || step.name !== "delete_file") {
      throw new Error("delete_file step not found");
    }
    if (!step.path || typeof step.restoreContent !== "string") {
      throw new Error(t("chat.restoreDeletedFileUnavailable"));
    }

    const ttl = readDeleteFileRestoreTtlDays();
    if (isDeleteRestoreExpired(step, ttl)) {
      // 已超时：清缓存，不可再恢
      const pruned = pruneExpiredDeleteRestoreCaches(run.messagesRef.current, ttl);
      if (pruned !== run.messagesRef.current) {
        run.commitMessages(pruned);
      }
      throw new Error(t("chat.restoreDeletedFileExpired"));
    }

    try {
      await workspaceWriteFile(wid, step.path, step.restoreContent);
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }

    run.commitMessages((prev) =>
      prev.map((m) => {
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
      }),
    );
  }

  return {
    messages: run.messages,
    draft,
    setDraft: reconcileDraftAttachments,
    draftAttachments,
    attachFiles,
    removeAttachment,
    clearDraftAttachments,
    editAttachments: edit.editAttachments,
    attachEditFiles: edit.attachEditFiles,
    removeEditAttachment: edit.removeEditAttachment,
    busy,
    queued: queue.queued,
    empty,
    scroller,
    /** 递增以强制聊天舞台贴底（配合 ChatStage）*/
    stickNonce,
    inputRef,
    editInputRef: edit.editInputRef,
    editingUserId: edit.editingUserId,
    editDraft: edit.editDraft,
    setEditDraft: edit.setEditDraft,
    beginEditUserMessage: edit.beginEditUserMessage,
    cancelUserEdit: edit.clearUserEdit,
    sendUserEdit: edit.sendUserEdit,
    onEditKeyDown: edit.onEditKeyDown,
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
    flushSave: persistence.flushSave,
    onKeyDown,
    restoreDeletedFile,
    /** 其它会话仍在跑的数量（侧栏 / 后台指示） */
    backgroundRunCount: listBusyLiveRuns().filter((s) => s.sessionId !== sessionId).length,
  };
}
