/**
 * 进行中 Run 的内存投影：所有 AgentEvent 写入会话槽；前台/后台共用。
 * 切换会话不取消；DB 不覆盖未结算槽的流式尾部。
 */
import type {
  AgentEvent,
  ChatMessage,
  ChatTimelineStep,
  HitlRequest,
} from "@thinker-workbench/shared";
import { onAgentEvent } from "../../bridge/thinker";
import { saveSessionMessages } from "../../bridge/workspaces";
import { classifyRunError, softStopResumeKind } from "./runErrors";
import {
  appendError,
  appendModelSwitch,
  appendReplyText,
  appendThinkingText,
  applyHitlRequest,
  applyHitlResolved,
  applyQueuedSlotEvent,
  applyStatus,
  applySubagentEvent,
  applyToolEvent,
  deactivateAll,
} from "./timelineModel";

export type LiveRunSlot = {
  sessionId: string;
  threadId: string;
  runId: string | null;
  busy: boolean;
  /** 已请求停止、等待账本结算事件。 */
  stopping: boolean;
  messages: ChatMessage[];
  streamText: string;
  timeline: ChatTimelineStep[];
  targetMsgId: string | null;
  /** 非时间线 HITL（密钥 / 澄清）；时间线类挂在 tool.hitl。 */
  modalHitl: HitlRequest | null;
  /** 结算后的可恢复种类。 */
  canResume: false | "cancelled" | "crashed";
};

type Listener = () => void;

const slots = new Map<string, LiveRunSlot>();
const threadToSession = new Map<string, string>();
const listeners = new Set<Listener>();
let foregroundSessionId: string | null = null;
let started = false;
let unsub: (() => void) | null = null;

function notify(): void {
  for (const l of listeners) l();
}

function isTimelineHitl(kind: string): boolean {
  return kind === "shell_approval" || kind === "shell_write_approval";
}

/** 启动全局事件订阅（幂等）。 */
export function ensureLiveRunRegistry(): void {
  if (started) return;
  started = true;
  unsub = onAgentEvent((event) => {
    void applyAgentEvent(event);
  });
}

/** 测试 / 热更新时可拆掉订阅。 */
export function stopLiveRunRegistry(): void {
  unsub?.();
  unsub = null;
  started = false;
}

export function subscribeLiveRuns(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setForegroundSessionId(sessionId: string | null): void {
  foregroundSessionId = sessionId?.trim() || null;
}

export function getForegroundSessionId(): string | null {
  return foregroundSessionId;
}

export function getLiveRunSlot(sessionId: string): LiveRunSlot | undefined {
  return slots.get(sessionId);
}

export function listBusyLiveRuns(): LiveRunSlot[] {
  return [...slots.values()].filter((s) => s.busy);
}

/** 前台开始/恢复 run 时登记槽。 */
export function upsertLiveRunSlot(partial: {
  sessionId: string;
  threadId: string;
  runId?: string | null;
  messages: ChatMessage[];
  streamText?: string;
  timeline?: ChatTimelineStep[];
  targetMsgId?: string | null;
  busy?: boolean;
  stopping?: boolean;
  modalHitl?: HitlRequest | null;
  canResume?: false | "cancelled" | "crashed";
}): void {
  const sessionId = partial.sessionId.trim();
  if (!sessionId) return;
  const prev = slots.get(sessionId);
  const slot: LiveRunSlot = {
    sessionId,
    threadId: partial.threadId,
    runId: partial.runId !== undefined ? partial.runId : (prev?.runId ?? null),
    busy: partial.busy ?? prev?.busy ?? true,
    stopping: partial.stopping ?? prev?.stopping ?? false,
    messages: partial.messages,
    streamText: partial.streamText ?? prev?.streamText ?? "",
    timeline: partial.timeline ?? prev?.timeline ?? [],
    targetMsgId:
      partial.targetMsgId !== undefined ? partial.targetMsgId : (prev?.targetMsgId ?? null),
    modalHitl: partial.modalHitl !== undefined ? partial.modalHitl : (prev?.modalHitl ?? null),
    canResume: partial.canResume !== undefined ? partial.canResume : (prev?.canResume ?? false),
  };
  slots.set(sessionId, slot);
  threadToSession.set(partial.threadId, sessionId);
  notify();
}

/** 标记正在停止（取消请求已发出，等结算事件）。 */
export function markLiveRunStopping(sessionId: string): void {
  const slot = slots.get(sessionId.trim());
  if (!slot) return;
  slot.stopping = true;
  notify();
}

/** 切换离开前台时把当前流式态封存进槽（不 cancel）。 */
export function parkForegroundRun(state: {
  sessionId: string;
  threadId: string;
  runId: string | null;
  messages: ChatMessage[];
  streamText: string;
  timeline: ChatTimelineStep[];
  targetMsgId: string | null;
  busy: boolean;
}): void {
  if (!state.busy && !state.runId) {
    const existing = slots.get(state.sessionId);
    if (existing && !existing.busy) slots.delete(state.sessionId);
    return;
  }
  upsertLiveRunSlot({
    ...state,
    busy: state.busy,
  });
}

/** 前台接管槽。 */
export function takeLiveRunSlot(sessionId: string): LiveRunSlot | undefined {
  return slots.get(sessionId);
}

/**
 * 进行中重载：槽未结算时用槽尾部覆盖 DB 快照中的同 id 消息。
 */
export function mergeDbWithLiveSlot(
  sessionId: string,
  dbMessages: ChatMessage[],
): ChatMessage[] | null {
  const slot = slots.get(sessionId);
  if (!slot?.busy || !slot.targetMsgId) return null;
  const byId = new Map(dbMessages.map((m) => [m.id, m]));
  for (const m of slot.messages) {
    byId.set(m.id, m);
  }
  // 保持槽内顺序优先：若槽消息是超集则用槽
  if (slot.messages.length >= dbMessages.length) {
    return slot.messages.map((m) =>
      m.id === slot.targetMsgId
        ? {
            ...m,
            text: slot.streamText || m.text,
            pending: true,
            timeline: [...slot.timeline],
          }
        : m,
    );
  }
  return [...byId.values()];
}

function resolveSessionId(event: AgentEvent): string | null {
  const sid = event.chatSessionId?.trim();
  if (sid) return sid;
  return threadToSession.get(event.threadId) ?? null;
}

/**
 * 唯一事件应用入口：写入对应会话槽并通知订阅者。
 * 前台 useChatSession 订阅后投影到 React state。
 */
async function applyAgentEvent(event: AgentEvent): Promise<void> {
  const sessionId = resolveSessionId(event);
  if (!sessionId) return;

  let slot = slots.get(sessionId);
  if (!slot) {
    // 无槽时仍可登记终态外的流式事件（刷新后重挂依赖主进程 status + 前台 hydrate）
    if (
      event.type !== "token" &&
      event.type !== "tool" &&
      event.type !== "status" &&
      event.type !== "hitl" &&
      event.type !== "subagent" &&
      event.type !== "done" &&
      event.type !== "error"
    ) {
      return;
    }
    // 后台无槽的 hitl/token：无法投影，跳过（前台会自己 upsert）
    if (!foregroundSessionId || sessionId !== foregroundSessionId) {
      if (event.type === "hitl" || event.type === "subagent") {
        // 后台会话必须有槽才能收 HITL；尝试用最小槽占位
        slot = {
          sessionId,
          threadId: event.threadId,
          runId: event.runId,
          busy: true,
          stopping: false,
          messages: [],
          streamText: "",
          timeline: [],
          targetMsgId: null,
          modalHitl: null,
          canResume: false,
        };
        slots.set(sessionId, slot);
        threadToSession.set(event.threadId, sessionId);
      } else {
        return;
      }
    } else {
      return;
    }
  }

  if (slot.runId && event.runId !== slot.runId) return;
  if (!slot.runId) slot.runId = event.runId;

  applyQueuedSlotEvent(slot, event.type);

  if (event.type === "hitl") {
    if (event.phase === "request" && event.request) {
      if (isTimelineHitl(event.request.kind)) {
        slot.timeline = applyHitlRequest(slot.timeline, event.request);
        slot.modalHitl = null;
      } else {
        slot.modalHitl = event.request;
      }
    } else if (event.phase === "resolved") {
      slot.timeline = applyHitlResolved(slot.timeline, event.hitlId, event.response?.actionId);
      if (slot.modalHitl?.hitlId === event.hitlId) slot.modalHitl = null;
    }
    syncTargetMessage(slot);
    scheduleBgSave(sessionId);
    notify();
    return;
  }

  if (event.type === "token") {
    if (event.channel === "thinking") {
      slot.timeline = appendThinkingText(slot.timeline, event.text);
    } else {
      slot.streamText += event.text;
      slot.timeline = appendReplyText(slot.timeline, event.text);
    }
  } else if (event.type === "status") {
    slot.timeline = applyStatus(slot.timeline, event.status);
  } else if (event.type === "tool") {
    slot.timeline = applyToolEvent(slot.timeline, event);
  } else if (event.type === "subagent") {
    slot.timeline = applySubagentEvent(slot.timeline, event);
  } else if (event.type === "model_switch") {
    slot.timeline = appendModelSwitch(slot.timeline, event);
  } else if (event.type === "done" || event.type === "error") {
    await settleSlot(slot, event);
    notify();
    return;
  } else {
    return;
  }

  syncTargetMessage(slot);
  scheduleBgSave(sessionId);
  notify();
}

function syncTargetMessage(slot: LiveRunSlot): void {
  if (!slot.targetMsgId) return;
  slot.messages = slot.messages.map((m) =>
    m.id === slot.targetMsgId
      ? {
          ...m,
          text: slot.streamText || m.text,
          pending: true,
          timeline: [...slot.timeline],
        }
      : m,
  );
}

async function settleSlot(
  slot: LiveRunSlot,
  event: Extract<AgentEvent, { type: "done" | "error" }>,
): Promise<void> {
  const sessionId = slot.sessionId;
  slot.timeline = deactivateAll(slot.timeline);
  slot.modalHitl = null;
  slot.stopping = false;

  if (event.type === "done") {
    const text = event.text || slot.streamText;
    slot.messages = slot.messages.map((m) =>
      m.id === slot.targetMsgId
        ? {
            ...m,
            text: text || m.text,
            pending: false,
            timeline: [...slot.timeline],
          }
        : m,
    );
    slot.canResume = false;
  } else {
    const errCode =
      event.code === "cancelled"
        ? "CANCELLED"
        : event.code === "crashed"
          ? "PROCESS_EXIT"
          : classifyRunError(event.error);
    const resume = softStopResumeKind(event.error, errCode);
    slot.canResume = resume ?? false;
    const display =
      errCode === "PROCESS_EXIT"
        ? "Exited unexpectedly."
        : errCode === "CANCELLED"
          ? "Stopped."
          : event.error;
    slot.timeline = appendError(slot.timeline, display, errCode);
    slot.messages = slot.messages.map((m) =>
      m.id === slot.targetMsgId
        ? {
            ...m,
            text: slot.streamText || m.text,
            pending: false,
            timeline: [...slot.timeline],
          }
        : m,
    );
  }

  slot.busy = false;
  slot.runId = null;
  slot.targetMsgId = null;
  slot.streamText = "";
  try {
    await saveSessionMessages(sessionId, slot.messages);
  } catch {
    /* ignore */
  }
}

const bgSaveTimers = new Map<string, number>();

function scheduleBgSave(sessionId: string): void {
  const prev = bgSaveTimers.get(sessionId);
  if (prev != null) window.clearTimeout(prev);
  const timer = window.setTimeout(() => {
    bgSaveTimers.delete(sessionId);
    const slot = slots.get(sessionId);
    if (!slot) return;
    void saveSessionMessages(sessionId, slot.messages);
  }, 400);
  bgSaveTimers.set(sessionId, timer);
}
