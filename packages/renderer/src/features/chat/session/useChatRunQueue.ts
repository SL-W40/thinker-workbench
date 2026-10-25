/**
 * 排队态：queued / promoteQueuedUi / syncQueueFromDb。
 *
 * 「已入队、尚未占并行槽」与 busy 是两回事：queued 时气泡挂在等待步骤上，
 * 拿到槽（promote）才进入流式 busy。名名同步与 running 切换都走 syncQueueFromDb。
 */

import { useRef, useState } from "react";
import { getSession, listThreads } from "../../../platform/ipc/workspaces";
import type { MessageKey } from "../../../ui/i18n/translate";
import { QUEUED_WAIT_STEP_ID, stripQueuedWait, withQueuedWait } from "../timeline";
import { upsertLiveRunSlot } from "./liveRunRegistry";
import type { ChatRunState } from "./useChatRunState";

/** 队列 Hook 需要的 UI 副作用（由编排核心注入）。 */
export type ChatQueueUi = {
  setBusy: (v: boolean) => void;
  setCanResume: (v: boolean | "cancelled" | "crashed") => void;
  setThreadId: (v: string | undefined) => void;
  t: (key: MessageKey, vars?: Record<string, string>) => string;
};

export type ChatRunQueue = {
  /** 本会话已入队、尚未占并行槽。不要把它当成 busy。 */
  queued: boolean;
  queuedRef: React.RefObject<boolean>;
  /** 同步写 queued 状态与 ref；退出排队时清名次。 */
  setQueuedState: (next: boolean) => void;
  /** 记录当前排队名次（发送 / 续跑入队时由编排核心写入）。 */
  noteQueuePosition: (pos: number | null) => void;
  /** 出队：去掉等待文案，这时才进入流式 busy。 */
  promoteQueuedUi: (nextThreadId?: string) => void;
  /** 侧栏刷新后同步名次，或在 runStatus 变成 running 时切到流式。 */
  syncQueueFromDb: () => Promise<void>;
  /** 供 threadsChanged 订阅调用的稳定引用。 */
  syncQueueRef: React.RefObject<() => void>;
};

/** 创建排队态与出队 / 同步能力。 */
export function useChatRunQueue(state: ChatRunState, ui: ChatQueueUi): ChatRunQueue {
  const [queued, setQueued] = useState(false);
  const queuedRef = useRef(false);
  const queuePositionRef = useRef<number | null>(null);
  const syncQueueRef = useRef<() => void>(() => {});

  function setQueuedState(next: boolean) {
    queuedRef.current = next;
    setQueued(next);
    if (!next) queuePositionRef.current = null;
  }

  /** 记录当前排队名次（发送 / 续跑入队时由编排核心写入）。 */
  function noteQueuePosition(pos: number | null) {
    queuePositionRef.current = pos;
  }

  /** 出队：去掉等待文案，这时才进入流式 busy。 */
  function promoteQueuedUi(nextThreadId?: string) {
    if (!queuedRef.current) return;
    setQueuedState(false);
    state.timelineRef.current = stripQueuedWait(state.timelineRef.current);
    ui.setBusy(true);
    ui.setCanResume(false);
    if (nextThreadId) ui.setThreadId(nextThreadId);
    const id = state.targetMsgIdRef.current;
    if (id) {
      state.commitMessages(
        (prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, pending: true, timeline: [...state.timelineRef.current] } : m,
          ),
        { persist: false },
      );
    }
    const sid = state.sessionIdRef.current;
    const tid = nextThreadId;
    if (sid && tid) {
      upsertLiveRunSlot({
        sessionId: sid,
        threadId: tid,
        runId: state.activeRunIdRef.current,
        messages: state.messagesRef.current,
        targetMsgId: id,
        busy: true,
        streamText: state.streamTextRef.current,
        timeline: state.timelineRef.current,
      });
    }
  }

  /** 侧栏刷新后同步名次，或在 runStatus 变成 running 时切到流式。 */
  async function syncQueueFromDb() {
    const sid = state.sessionIdRef.current;
    if (!sid) return;
    const loaded = await getSession(sid);
    if (!loaded || state.sessionIdRef.current !== sid) return;
    const status = loaded.session.runStatus;
    if (status === "running") {
      if (queuedRef.current) promoteQueuedUi(loaded.session.threadId);
      return;
    }
    if (status !== "queued") {
      if (queuedRef.current) setQueuedState(false);
      return;
    }
    ui.setBusy(false);
    ui.setCanResume(false);
    if (!queuedRef.current) setQueuedState(true);
    state.activeRunIdRef.current = loaded.session.activeRunId ?? state.activeRunIdRef.current;
    const threads = await listThreads();
    if (state.sessionIdRef.current !== sid) return;
    const pos = threads.find((th) => th.sessionId === sid)?.queuePosition ?? null;
    const text = pos ? ui.t("chat.queued", { position: String(pos) }) : ui.t("chat.queuedUnknown");
    const pending = [...state.messagesRef.current]
      .reverse()
      .find((m) => m.role === "assistant" && m.pending);
    if (!pending) return;
    const current = (pending.timeline ?? []).find((step) => step.id === QUEUED_WAIT_STEP_ID);
    if (current?.kind === "text" && current.text === text && queuePositionRef.current === pos)
      return;
    queuePositionRef.current = pos;
    state.targetMsgIdRef.current = pending.id;
    state.timelineRef.current = withQueuedWait(pending.timeline ?? [], text);
    state.commitMessages(
      (prev) =>
        prev.map((m) =>
          m.id === pending.id
            ? { ...m, pending: true, timeline: [...state.timelineRef.current] }
            : m,
        ),
      { persist: false },
    );
  }

  syncQueueRef.current = () => {
    void syncQueueFromDb();
  };

  return {
    queued,
    queuedRef,
    setQueuedState,
    noteQueuePosition,
    promoteQueuedUi,
    syncQueueFromDb,
    syncQueueRef,
  };
}
