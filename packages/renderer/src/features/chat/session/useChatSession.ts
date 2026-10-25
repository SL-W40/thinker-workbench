/**
 * 聊天会话编排核心：装配 runState / persistence / eventStream / queue / edit 五个 Hook，
 * 再把会话选择、工作空间、发送 / 续跑等编排职责分派给同名子 Hook。
 *
 * 拆分约束（对外契约）：
 * - 返回对象的字段名与形状逐字保持不变（App.tsx 是唯一调用方）
 * - 消息写路径全部经 run.commitMessages（setMessages + ref 同步 + 防抖落库三者不可分）
 * - send / resume / selectSession 三个动作互相调用：彼此不得互相 import，
 *   由本文件用 sendRef 中转（沿用拆分前函数声明提升的时序语义，事件回调里读到的都是已装配的实现）
 */

import { type ChatMessage, type ChatTodo, unfinishedTodos } from "@thinker-workbench/shared";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { cancelAgent, pickDirectory } from "../../../platform/ipc/thinker";
import {
  createSession,
  createWorkspace,
  getSession,
  setLastWorkspaceId,
  setSessionTodos,
} from "../../../platform/ipc/workspaces";
import { useT } from "../../../ui/i18n/useI18n";
import { useEnsureModelSecrets, useShowModelSecretGate } from "../../modelSecrets/ModelSecretGate";
import type { ComposerEditorHandle } from "../composer/ComposerEditor";
import { chatSubmitBlocked } from "../composer/chatSubmit";
import type { WorkspaceGate } from "../composer/useDraftImages";
import { settleLoadedMessages } from "../message/messageClock";
import { QUEUED_WAIT_STEP_ID, withQueuedWait } from "../timeline";
import { listBusyLiveRuns, markLiveRunStopping } from "./liveRunRegistry";
import { resumeKindFromRunStatus, TODOS_PERSIST_DELAY_MS } from "./sessionHelpers";
import { useChatEventStream } from "./useChatEventStream";
import { useChatMessageEdit } from "./useChatMessageEdit";
import { useChatPersistence } from "./useChatPersistence";
import { useChatRunQueue } from "./useChatRunQueue";
import { useChatRunState } from "./useChatRunState";
import { useRestoreDeletedFile } from "./useRestoreDeletedFile";
import { useSessionAttachments } from "./useSessionAttachments";
import { useSessionBootstrap } from "./useSessionBootstrap";
import { useSessionResume } from "./useSessionResume";
import { useSessionSender } from "./useSessionSender";
import { useSessionWorkspace } from "./useSessionWorkspace";

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
  /** 会话待办（会话级状态：不依赖计划，输入框上方展示）。 */
  const [todos, setTodos] = useState<ChatTodo[]>([]);
  const todosRef = useRef<ChatTodo[]>([]);
  const todosPersistTimer = useRef<number | null>(null);
  const todosPersistSession = useRef<string | null>(null);
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
  // send / applyLoadedSession 定义在下方（函数声明提升），这里传入时已可用；它们只在渲染后
  // 的事件回调里被调用，闭包引用的各 Hook 返回值届时均已初始化。
  const run = useChatRunState();

  /**
   * 会话待办：会话级状态（真值在会话记录），与计划解耦。
   * 更新后防抖落库 —— 执行阶段每步都会推一次，没必要逐次写盘。
   */
  const applyTodos = useCallback(
    (next: ChatTodo[]) => {
      todosRef.current = next;
      setTodos(next);
      const sid = run.sessionIdRef.current;
      if (!sid) return;
      todosPersistSession.current = sid;
      if (todosPersistTimer.current != null) window.clearTimeout(todosPersistTimer.current);
      todosPersistTimer.current = window.setTimeout(() => {
        todosPersistTimer.current = null;
        void setSessionTodos(sid, todosRef.current).catch((err) =>
          console.error("setSessionTodos failed", err),
        );
      }, TODOS_PERSIST_DELAY_MS);
    },
    [run.sessionIdRef],
  );

  /** 立刻补写待办（发消息 / 切会话前调用，避免读到旧值）。 */
  const flushTodos = useCallback(() => {
    if (todosPersistTimer.current == null) return;
    window.clearTimeout(todosPersistTimer.current);
    todosPersistTimer.current = null;
    const sid = todosPersistSession.current;
    if (!sid) return;
    void setSessionTodos(sid, todosRef.current).catch((err) =>
      console.error("setSessionTodos failed", err),
    );
  }, []);

  /**
   * 清理已完成待办：只保留未完成（含进行中）项，并复用 applyTodos 的防抖落库路径。
   */
  const clearCompletedTodos = useCallback(() => {
    applyTodos(unfinishedTodos(todosRef.current));
  }, [applyTodos]);

  /** 切会话 / 首次挂载：从会话记录取回待办；离开旧会话前先把待办补写回去。 */
  useEffect(() => {
    const previous = todosPersistSession.current;
    if (previous && previous !== sessionId) {
      if (todosPersistTimer.current != null) {
        window.clearTimeout(todosPersistTimer.current);
        todosPersistTimer.current = null;
      }
      void setSessionTodos(previous, todosRef.current).catch(() => undefined);
    }
    if (!sessionId) {
      todosPersistSession.current = null;
      todosRef.current = [];
      setTodos([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const loaded = await getSession(sessionId);
      if (cancelled) return;
      todosRef.current = loaded?.session.todos ?? [];
      setTodos(todosRef.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const queue = useChatRunQueue(run, { setBusy, setCanResume, setThreadId, t });
  const persistence = useChatPersistence(run, { applyLoadedSession });

  // edit 需要 send，而 send 又需要 edit 的收口能力：两边都不互相 import，
  // 这里给 edit 一个只读转到 sendRef 的壳，真正的实现在 useSessionSender 返回后装填。
  const sendRef = useRef<
    null | ((override?: string, replaceUserId?: string | null) => Promise<void>)
  >(null);
  const edit = useChatMessageEdit(run, {
    send: (override?: string, replaceUserId?: string | null) =>
      sendRef.current?.(override, replaceUserId) ?? Promise.resolve(),
    busy,
    queued: queue.queued,
    workspaceId,
  });

  // sender 需要用工作空间标签同步（新建会话时），而 workspace 在 sender 之后才装配：
  // 同样走 ref，避免 two hook 互相依赖成环。
  const workspaceRef = useRef<null | ReturnType<typeof useSessionWorkspace>>(null);
  const attachments = useSessionAttachments({ draft, sessionId, setDraft, workspaceId });

  const sender = useSessionSender({
    busy,
    clearDraftAttachments: attachments.clearDraftAttachments,
    draft,
    draftAttachmentsRef: attachments.draftAttachmentsRef,
    edit,
    ensureModelSecrets,
    flushTodos,
    inputRef,
    persistence,
    queue,
    requestStickToBottom,
    run,
    setActiveTraceId,
    setBusy,
    setCanResume,
    setDraft,
    setSessionId,
    setThreadId,
    setWorkspaceGate,
    sessionId,
    showModelSecretGate,
    submittingRef,
    syncWorkspaceLabel: async (id: string | null) => {
      await workspaceRef.current?.syncWorkspaceLabel(id);
    },
    t,
    threadId,
    workspaceId,
  });
  sendRef.current = sender.send;

  // workspace / bootstrap 互相依赖：workspace 先装配，bootstrap 才能拿到重定位能力
  const workspace = useSessionWorkspace({
    applyLoadedSession,
    busy,
    clearDraftAttachments: attachments.clearDraftAttachments,
    edit,
    inputRef,
    persistence,
    queue,
    requestStickToBottom,
    run,
    sessionId,
    setActiveTraceId,
    setBusy,
    setCanResume,
    setDraft,
    setSessionId,
    setThreadId,
    setWorkspaceGate,
    setWorkspaceId,
    setWorkspaceName,
    setWorkspaceRoot,
    t,
    threadId,
    workspaceId,
    workspaceIdRef,
  });
  workspaceRef.current = workspace;

  useSessionBootstrap({
    applyLoadedSession,
    inputRef,
    persistence,
    queue,
    reconcileIfSessionGone: workspace.reconcileIfSessionGone,
    requestStickToBottom,
    run,
    sessionId,
    setSessionId,
    setThreadId,
    syncWorkspaceLabel: workspace.syncWorkspaceLabel,
    visible,
    workspaceId,
    workspaceIdRef,
  });

  const resumeHook = useSessionResume({
    busy,
    ensureModelSecrets,
    queue,
    requestStickToBottom,
    run,
    setActiveTraceId,
    setBusy,
    setCanResume,
    t,
    threadId,
  });

  const restore = useRestoreDeletedFile({ run, t, workspaceId });

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
    applyTodos,
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
    void sender.send();
  }

  return {
    messages: run.messages,
    draft,
    setDraft: attachments.reconcileDraftAttachments,
    /** 会话待办（会话级状态，独立于计划）与其更新入口。 */
    todos,
    applyTodos,
    clearCompletedTodos,
    draftAttachments: attachments.draftAttachments,
    attachFiles: attachments.attachFiles,
    removeAttachment: attachments.removeAttachment,
    clearDraftAttachments: attachments.clearDraftAttachments,
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
      await workspace.syncWorkspaceLabel(ws.id);
      const created = await createSession(ws.id);
      await workspace.activateNewSession(created.id, created.threadId);
      setWorkspaceGate(null);
    },
    workspaceId,
    workspaceName,
    workspaceRoot,
    send: sender.send,
    cancel,
    resume: resumeHook.resume,
    selectSession: workspace.selectSession,
    selectWorkspace: workspace.selectWorkspace,
    activateNewSession: workspace.activateNewSession,
    newChat: workspace.newChat,
    flushSave: persistence.flushSave,
    onKeyDown,
    restoreDeletedFile: restore.restoreDeletedFile,
    /** 其它会话仍在跑的数量（侧栏 / 后台指示） */
    backgroundRunCount: listBusyLiveRuns().filter((s) => s.sessionId !== sessionId).length,
  };
}
