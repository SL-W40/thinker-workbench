/**
 * 会话与工作空间的切换编排：同步工作空间标签、切会话（含直播态封存与接管）、
 * 新建会话、会话被删后的兜底重定位、选中工作空间。
 */

import { useCallback } from "react";
import { cancelAgent } from "../../../platform/ipc/thinker";
import {
  createSession,
  getLastWorkspaceId,
  getSession,
  listSessions,
  listWorkspaces,
  setActiveSession,
  setLastWorkspaceId,
} from "../../../platform/ipc/workspaces";
import type { useT } from "../../../ui/i18n/useI18n";
import type { WorkspaceGate } from "../composer/useDraftImages";
import {
  mergeDbWithLiveSlot,
  parkForegroundRun,
  setForegroundSessionId,
  takeLiveRunSlot,
} from "./liveRunRegistry";
import type { ChatMessageEdit } from "./useChatMessageEdit";
import type { ApplyLoadedSession, ChatPersistence } from "./useChatPersistence";
import type { ChatRunQueue } from "./useChatRunQueue";
import type { ChatRunState } from "./useChatRunState";

type Translate = ReturnType<typeof useT>;

export type SessionWorkspaceDeps = {
  applyLoadedSession: ApplyLoadedSession;
  busy: boolean;
  clearDraftAttachments: () => void;
  edit: ChatMessageEdit;
  inputRef: { current: null | { focus: () => void } };
  persistence: ChatPersistence;
  queue: ChatRunQueue;
  requestStickToBottom: () => void;
  run: ChatRunState;
  sessionId: string | null;
  setActiveTraceId: (id: string | null) => void;
  setBusy: (v: boolean) => void;
  setCanResume: (v: boolean | "cancelled" | "crashed") => void;
  setDraft: (text: string) => void;
  setSessionId: (id: string | null) => void;
  setThreadId: (id: string | undefined) => void;
  setWorkspaceGate: (gate: WorkspaceGate) => void;
  setWorkspaceId: (id: string | null) => void;
  setWorkspaceName: (name: string | null) => void;
  setWorkspaceRoot: (root: string | null) => void;
  t: Translate;
  threadId: string | undefined;
  workspaceId: string | null;
  workspaceIdRef: { current: string | null };
};

export function useSessionWorkspace(host: SessionWorkspaceDeps) {
  const {
    applyLoadedSession,
    busy,
    clearDraftAttachments,
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
  } = host;
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
  return {
    activateNewSession,
    newChat,
    reconcileIfSessionGone,
    selectSession,
    selectWorkspace,
    syncWorkspaceLabel,
  };
}
