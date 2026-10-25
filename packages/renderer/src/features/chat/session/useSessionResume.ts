/**
 * 断点续跑：清掉失败残留的错误步，接着崩溃前那条助手消息继续往下写。
 */

import { type ChatMessage, createTraceId } from "@thinker-workbench/shared";
import { resumeAgent } from "../../../platform/ipc/thinker";
import type { useT } from "../../../ui/i18n/useI18n";
import { finishMessageClock, localElapsedMs } from "../message/messageClock";
import { createMessage, failAssistantMessage } from "../message/messageModel";
import { classifyRunError, isSoftStopCode, softStopResumeKind } from "../shared/runErrors";
import { appendError, deactivateAll, pickRicherTimeline, withQueuedWait } from "../timeline";
import { upsertLiveRunSlot } from "./liveRunRegistry";
import { isResumeStubMessage } from "./sessionHelpers";
import type { ChatRunQueue } from "./useChatRunQueue";
import type { ChatRunState } from "./useChatRunState";

type Translate = ReturnType<typeof useT>;

export type SessionResumeDeps = {
  busy: boolean;
  ensureModelSecrets: () => Promise<boolean>;
  queue: ChatRunQueue;
  requestStickToBottom: () => void;
  run: ChatRunState;
  setActiveTraceId: (id: string | null) => void;
  setBusy: (v: boolean) => void;
  setCanResume: (v: boolean | "cancelled" | "crashed") => void;
  t: Translate;
  threadId: string | undefined;
};

export function useSessionResume(host: SessionResumeDeps) {
  const {
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
  } = host;
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
  return { resume };
}
