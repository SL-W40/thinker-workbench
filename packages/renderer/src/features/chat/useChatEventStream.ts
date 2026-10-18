/**
 * AgentEvent / TerminalEvent 流：把 useChatSession 原 300 行事件 effect 搬到这里。
 *
 * 事件类型分支从「一个巨型 if 链」改为「处理器表」：
 * - timelineHandlers：改 timelineRef 后整体 patch 到目标气泡（hitl / status / tool /
 *   model_switch / subagent / model_health / token）
 * - done / error：终态收束（在表外，因为要先掐断未刷帧）
 *
 * 前置门（epoch 陈旧 / thread 归属 / 排队出队 / 停止抑制 / 目标重挂）保持原顺序，
 * 任何一步不满足即丢弃事件——行为与原实现逐分支对齐。
 */

import {
  type AgentDoneEvent,
  type AgentErrorEvent,
  type AgentEvent,
  addUsage,
  type ChatMessage,
  type ChatTimelineStep,
  EMPTY_USAGE,
} from "@thinker-workbench/shared";
import { useEffect } from "react";
import { onTerminalEvent } from "../../bridge/terminal";
import { onAgentEvent } from "../../bridge/thinker";
import { upsertLiveRunSlot } from "./liveRunRegistry";
import { finishMessageClock } from "./messageClock";
import { failAssistantMessage } from "./messageModel";
import { finishMessageUsage } from "./messageUsage";
import { classifyRunError, softStopResumeKind } from "./runErrors";
import {
  appendModelSwitch,
  appendReplyText,
  appendShellLiveOutput,
  appendThinkingText,
  applyHitlRequest,
  applyHitlResolved,
  applyShellCommandBackgrounded,
  applyShellCommandExited,
  applyStatus,
  applySubagentEvent,
  applyToolEvent,
  bindShellSessionId,
  deactivateAll,
  isTimelineHitlKind,
  reconcileTimelineReply,
  stripQueuedWait,
  stripTransitionLines,
} from "./timelineModel";
import type { ChatRunQueue } from "./useChatRunQueue";
import type { ChatRunState } from "./useChatRunState";

/** 事件流需要的会话级 UI 副作用与队列 / 重载能力（由编排核心注入）。 */
export type ChatEventStreamDeps = {
  threadId: string | undefined;
  setBusy: (v: boolean) => void;
  setCanResume: (v: boolean | "cancelled" | "crashed") => void;
  setThreadId: (v: string | undefined) => void;
  queue: Pick<ChatRunQueue, "queuedRef" | "setQueuedState" | "promoteQueuedUi">;
  reloadCurrentSessionFromDb: () => Promise<void>;
};

/** 挂载事件流订阅（agent 事件 + 终端输出）。 */
export function useChatEventStream(state: ChatRunState, deps: ChatEventStreamDeps): void {
  // 只随 threadId（切会话）重订；state / deps 里的 setter 与 ref 均稳定或即时读取，
  // 列入依赖会在流式 setMessages 时反复 unsub/sub，丢掉中途 token 与终态 done
  // （表现为半截输出 + 转圈不停）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 同上，重订代价是丢流式事件
  useEffect(() => {
    /** 给目标助手消息累加 usage（直播期可见增长）。 */
    const patchTargetUsage = (delta: ChatMessage["usage"]) => {
      if (!delta) return;
      const id = state.targetMsgIdRef.current;
      if (!id) return;
      state.commitMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, usage: addUsage(m.usage ?? EMPTY_USAGE, delta) } : m,
        ),
      );
    };

    const patchTarget = (patch: Partial<ChatMessage> & { timeline?: ChatTimelineStep[] }) => {
      const id = state.targetMsgIdRef.current;
      if (!id) return;
      if (patch.timeline) state.timelineRef.current = patch.timeline;
      state.commitMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    };

    const flushStream = () => {
      state.rafRef.current = null;
      const id = state.targetMsgIdRef.current;
      if (!id) return;
      const text = state.streamTextRef.current;
      state.commitMessages(
        (prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, text, pending: true, timeline: [...state.timelineRef.current] }
              : m,
          ),
        { persist: false },
      );
    };
    state.flushStreamRef.current = flushStream;

    const scheduleFlush = () => {
      if (state.rafRef.current != null) return;
      state.rafRef.current = window.requestAnimationFrame(flushStream);
    };

    /** 时间线类事件：改 timelineRef 后整体 patch 到目标气泡。 */
    const timelineHandlers: Partial<Record<AgentEvent["type"], (event: AgentEvent) => void>> = {
      hitl: (event) => {
        if (event.type !== "hitl") return;
        const hitlKind = event.request?.kind;
        if (
          event.phase === "request" &&
          hitlKind &&
          isTimelineHitlKind(hitlKind) &&
          event.request
        ) {
          state.timelineRef.current = applyHitlRequest(state.timelineRef.current, event.request);
          patchTarget({ timeline: [...state.timelineRef.current], pending: true });
        } else if (event.phase === "resolved") {
          state.timelineRef.current = applyHitlResolved(
            state.timelineRef.current,
            event.hitlId,
            event.response?.actionId,
            event.response?.values,
          );
          patchTarget({ timeline: [...state.timelineRef.current], pending: true });
        }
      },
      status: (event) => {
        if (event.type !== "status") return;
        state.timelineRef.current = applyStatus(state.timelineRef.current, event.status);
        patchTarget({ timeline: [...state.timelineRef.current], pending: true });
      },
      tool: (event) => {
        if (event.type !== "tool") return;
        state.timelineRef.current = applyToolEvent(state.timelineRef.current, event);
        patchTarget({ timeline: [...state.timelineRef.current], pending: true });
      },
      model_switch: (event) => {
        if (event.type !== "model_switch") return;
        state.timelineRef.current = appendModelSwitch(state.timelineRef.current, event);
        patchTarget({ timeline: [...state.timelineRef.current], pending: true });
      },
      subagent: (event) => {
        if (event.type !== "subagent") return;
        state.timelineRef.current = applySubagentEvent(state.timelineRef.current, event);
        patchTarget({ timeline: [...state.timelineRef.current], pending: true });
      },
      // 仅落盘由 main 处理；UI 无需展示
      model_health: () => {},
      token: (event) => {
        if (event.type !== "token") return;
        const channel = event.channel ?? "reply";
        if (channel === "thinking") {
          state.timelineRef.current = appendThinkingText(state.timelineRef.current, event.text);
          scheduleFlush();
          return;
        }
        state.timelineRef.current = appendReplyText(state.timelineRef.current, event.text);
        // 气泡正文剥离 [NEXT] 标记行（小结已进时间线 transition 步）；
        // 未完结的标记片段不匹配正则，补全后自然剥离
        state.streamTextRef.current = stripTransitionLines(
          `${state.streamTextRef.current}${event.text}`,
        );
        scheduleFlush();
      },
    };

    /** done：耗时与用量都以引擎下发值为准，缺省保持未知。 */
    const handleDone = (event: AgentDoneEvent, id: string) => {
      const text = stripTransitionLines(event.text || state.streamTextRef.current);
      state.streamTextRef.current = text;
      state.timelineRef.current = reconcileTimelineReply(
        deactivateAll(state.timelineRef.current),
        text,
      );
      deps.setCanResume(false);
      state.commitMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? // 耗时与用量都以引擎下发值为准，缺省保持未知
              finishMessageUsage(
                finishMessageClock(
                  {
                    ...m,
                    pending: false,
                    role: "assistant" as const,
                    text,
                    timeline: [...state.timelineRef.current],
                  },
                  event.durationMs,
                ),
                event.usage,
                event.usageEstimated,
              )
            : m,
        ),
      );
      state.targetMsgIdRef.current = null;
      state.activeRunIdRef.current = null;
      deps.setBusy(false);
      if (state.sessionIdRef.current && event.threadId) {
        upsertLiveRunSlot({
          sessionId: state.sessionIdRef.current,
          threadId: event.threadId,
          runId: null,
          messages: state.messagesRef.current,
          busy: false,
          targetMsgId: null,
          streamText: "",
          timeline: [],
        });
      }
    };

    /** error：区分「本地已写 CANCELLED」与引擎文案，补粗估 usage。 */
    const handleError = (event: AgentErrorEvent, id: string) => {
      const errCode = classifyRunError(event.error);
      const resume = softStopResumeKind(event.error, errCode);
      // 手动取消：仅时间线可续；进程异常：时间线可续
      deps.setCanResume(resume ?? false);
      state.commitMessages((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const baseTimeline = state.timelineRef.current.length
            ? state.timelineRef.current
            : (m.timeline ?? []);
          // 本地已写入「已停止」CANCELLED 时，保留友好文案，勿被 agent 的 "…cancelled" 覆盖；
          // 仍要补粗估 usage（此前漏掉会导致 Tokens: 0）。
          const alreadyStopped = baseTimeline.some(
            (s) => s.kind === "error" && s.code === "CANCELLED",
          );
          if (errCode === "CANCELLED" && alreadyStopped) {
            const settled = finishMessageUsage(
              finishMessageClock(
                {
                  ...m,
                  pending: false,
                  text: state.streamTextRef.current || m.text,
                  timeline: deactivateAll(baseTimeline),
                },
                event.durationMs,
              ),
              event.usage,
              event.usageEstimated,
            );
            state.timelineRef.current = settled.timeline ?? [];
            return settled;
          }
          const display =
            errCode === "PROCESS_EXIT"
              ? "Exited unexpectedly."
              : errCode === "CANCELLED"
                ? "Stopped."
                : event.error;
          const failed = finishMessageUsage(
            failAssistantMessage(
              { ...m, text: state.streamTextRef.current || m.text },
              display,
              baseTimeline,
              errCode,
              event.durationMs,
            ),
            event.usage,
            event.usageEstimated,
          );
          state.timelineRef.current = failed.timeline ?? [];
          return failed;
        }),
      );
      state.targetMsgIdRef.current = null;
      state.activeRunIdRef.current = null;
      deps.setBusy(false);
      if (state.sessionIdRef.current && event.threadId) {
        upsertLiveRunSlot({
          sessionId: state.sessionIdRef.current,
          threadId: event.threadId,
          runId: null,
          messages: state.messagesRef.current,
          busy: false,
          targetMsgId: null,
          streamText: "",
          timeline: [],
        });
      }
    };

    const boundSessionEpoch = state.sessionEpoch.capture();
    const unsub = onAgentEvent((event) => {
      // 会话已切换：丢弃绑定前的迟到事件
      if (state.sessionEpoch.isStale(boundSessionEpoch)) return;
      // 仅处理当前 thread 的事件
      if (deps.threadId && event.threadId !== deps.threadId) return;

      if (
        deps.queue.queuedRef.current &&
        (!state.activeRunIdRef.current || event.runId === state.activeRunIdRef.current)
      ) {
        if (event.type === "error" || event.type === "done") {
          deps.queue.setQueuedState(false);
          state.timelineRef.current = stripQueuedWait(state.timelineRef.current);
        } else if (event.type !== "model_health") {
          deps.queue.promoteQueuedUi(event.threadId);
        }
      }

      // 手动停止后：不重挂直播；终态仍合并 DB
      if (state.suppressLiveRef.current) {
        if (event.type === "done" || event.type === "error") {
          void deps.reloadCurrentSessionFromDb();
        }
        return;
      }

      // 刷新后丢失 target：挂回仍 pending 的助手气泡，继续收流
      if (!state.targetMsgIdRef.current) {
        const pending = [...state.messagesRef.current]
          .reverse()
          .find((m) => m.role === "assistant" && m.pending);
        if (pending) {
          state.targetMsgIdRef.current = pending.id;
          state.streamTextRef.current = pending.text || "";
          state.timelineRef.current = [...(pending.timeline ?? [])];
          state.activeRunIdRef.current = event.runId;
          deps.setBusy(true);
          deps.setCanResume(false);
          deps.setThreadId(event.threadId);
        } else if (event.type === "done" || event.type === "error") {
          // 无 pending 可挂：主进程应已 finalize，从 DB 拉终态
          void deps.reloadCurrentSessionFromDb();
          return;
        } else {
          return;
        }
      }

      if (event.type === "usage") {
        if (state.activeRunIdRef.current && event.runId !== state.activeRunIdRef.current) return;
        if (!state.activeRunIdRef.current) state.activeRunIdRef.current = event.runId;
        patchTargetUsage(event.usage);
        return;
      }

      const id = state.targetMsgIdRef.current;
      if (!id) return;
      if (state.activeRunIdRef.current && event.runId !== state.activeRunIdRef.current) return;
      state.activeRunIdRef.current = event.runId;
      deps.setThreadId(event.threadId);

      const timelineHandler = timelineHandlers[event.type];
      if (timelineHandler) {
        timelineHandler(event);
        return;
      }

      // 终态：先掐断未刷帧，避免半截文本被 settle 覆盖
      if (event.type === "done" || event.type === "error") {
        if (state.rafRef.current != null) {
          window.cancelAnimationFrame(state.rafRef.current);
          state.rafRef.current = null;
        }
        if (event.type === "done") handleDone(event, id);
        else handleError(event, id);
      }
    });

    return () => {
      state.flushStreamRef.current = null;
      unsub();
    };
  }, [deps.threadId]);

  // 终端输出 → 时间线 shell 步骤 liveOutput
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只挂载订阅；内部经 ref 与 commitMessages 即时读取
  useEffect(() => {
    const flushShellTimeline = () => {
      state.shellRafRef.current = null;
      const id = state.targetMsgIdRef.current;
      if (!id) return;
      state.commitMessages(
        (prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, pending: true, timeline: [...state.timelineRef.current] } : m,
          ),
        { persist: false },
      );
    };

    const scheduleShellFlush = () => {
      if (state.shellRafRef.current != null) return;
      state.shellRafRef.current = window.requestAnimationFrame(flushShellTimeline);
    };

    /** 终态事件立刻刷 UI，并取消未执行的 data 帧。 */
    const flushShellNow = () => {
      if (state.shellRafRef.current != null) {
        window.cancelAnimationFrame(state.shellRafRef.current);
        state.shellRafRef.current = null;
      }
      flushShellTimeline();
    };

    return onTerminalEvent((event) => {
      const id = state.targetMsgIdRef.current;
      if (!id) return;
      if (event.type === "created" && event.session.fromAgent) {
        state.timelineRef.current = bindShellSessionId(
          state.timelineRef.current,
          event.session.sessionId,
          {
            runId: event.session.runId,
            command: event.session.command,
          },
        );
        flushShellNow();
        return;
      }
      if (event.type === "commandBackgrounded") {
        state.timelineRef.current = applyShellCommandBackgrounded(
          state.timelineRef.current,
          event.sessionId,
        );
        flushShellNow();
        return;
      }
      if (event.type === "commandExited") {
        state.timelineRef.current = applyShellCommandExited(
          state.timelineRef.current,
          event.sessionId,
          event.exitCode,
        );
        flushShellNow();
        return;
      }
      if (event.type !== "data") return;
      state.timelineRef.current = appendShellLiveOutput(
        state.timelineRef.current,
        event.data,
        event.sessionId,
      );
      scheduleShellFlush();
    });
    // 只挂载订阅；逻辑经 ref 即时读取
  }, []);
}
