/**
 * 进行中 Run 的内存投影：切换会话不取消；后台会话继续收事件并落库。
 * 前台 useChatSession 只绑定当前 sessionId 对应槽。
 */
import type { AgentEvent, ChatMessage, ChatTimelineStep } from "@thinker-workbench/shared";
import { onAgentEvent } from "../../bridge/thinker";
import { saveSessionMessages } from "../../bridge/workspaces";
import {
  appendError,
  appendReplyText,
  appendThinkingText,
  applyStatus,
  applyToolEvent,
} from "./timelineModel";

export type LiveRunSlot = {
  sessionId: string;
  threadId: string;
  runId: string | null;
  busy: boolean;
  messages: ChatMessage[];
  streamText: string;
  timeline: ChatTimelineStep[];
  targetMsgId: string | null;
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

/** 启动全局事件订阅（幂等）。 */
export function ensureLiveRunRegistry(): void {
  if (started) return;
  started = true;
  unsub = onAgentEvent((event) => {
    void applyBackgroundEvent(event);
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

export function getLiveRunSlot(sessionId: string): LiveRunSlot | undefined {
  return slots.get(sessionId);
}

export function listBusyLiveRuns(): LiveRunSlot[] {
  return [...slots.values()].filter((s) => s.busy);
}

/** 前台开始/恢复 run 时登记槽。 */
export function upsertLiveRunSlot( partial: {
  sessionId: string;
  threadId: string;
  runId?: string | null;
  messages: ChatMessage[];
  streamText?: string;
  timeline?: ChatTimelineStep[];
  targetMsgId?: string | null;
  busy?: boolean;
}): void {
  const sessionId = partial.sessionId.trim();
  if (!sessionId) return;
  const prev = slots.get(sessionId);
  const slot: LiveRunSlot = {
    sessionId,
    threadId: partial.threadId,
    runId: partial.runId !== undefined ? partial.runId : prev?.runId ?? null,
    busy: partial.busy ?? true,
    messages: partial.messages,
    streamText: partial.streamText ?? prev?.streamText ?? "",
    timeline: partial.timeline ?? prev?.timeline ?? [],
    targetMsgId:
      partial.targetMsgId !== undefined ? partial.targetMsgId : prev?.targetMsgId ?? null,
  };
  slots.set(sessionId, slot);
  threadToSession.set(partial.threadId, sessionId);
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
    // idle 不必占槽
    const existing = slots.get(state.sessionId);
    if (existing && !existing.busy) slots.delete(state.sessionId);
    return;
  }
  upsertLiveRunSlot({
    ...state,
    busy: state.busy,
  });
}

/** 前台接管槽：取出后仍保留 busy 标记直到 done。 */
export function takeLiveRunSlot(sessionId: string): LiveRunSlot | undefined {
  return slots.get(sessionId);
}

function resolveSessionId(event: AgentEvent): string | null {
  const sid = event.chatSessionId?.trim();
  if (sid) return sid;
  return threadToSession.get(event.threadId) ?? null;
}

/**
 * 处理后台（非前台）会话事件：更新槽并落库。
 * 前台事件仍由 useChatSession 主路径处理，此处跳过以免双写。
 */
async function applyBackgroundEvent(event: AgentEvent): Promise<void> {
  const sessionId = resolveSessionId(event);
  if (!sessionId) return;
  if (foregroundSessionId && sessionId === foregroundSessionId) return;

  let slot = slots.get(sessionId);
  if (!slot) {
    // 刷新后可能无槽；仅跟踪终态外的 running 需要侧栏，落库依赖主进程 status
    if (event.type !== "token" && event.type !== "tool" && event.type !== "status") return;
    return;
  }
  if (slot.runId && event.runId !== slot.runId) return;
  if (!slot.runId) slot.runId = event.runId;

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
  } else if (event.type === "done" || event.type === "error") {
    const text =
      event.type === "done"
        ? event.text || slot.streamText
        : slot.streamText;
    const errText = event.type === "error" ? event.error : undefined;
    if (errText) {
      slot.timeline = appendError(slot.timeline, errText);
    }
    slot.messages = slot.messages.map((m) =>
      m.id === slot!.targetMsgId
        ? {
            ...m,
            text: text || m.text,
            pending: false,
            timeline: [...slot!.timeline],
            ...(errText ? { error: errText } : {}),
          }
        : m,
    );
    slot.busy = false;
    slot.runId = null;
    slot.targetMsgId = null;
    slot.streamText = "";
    try {
      await saveSessionMessages(sessionId, slot.messages);
    } catch {
      /* ignore */
    }
    notify();
    return;
  } else {
    return;
  }

  if (slot.targetMsgId) {
    slot.messages = slot.messages.map((m) =>
      m.id === slot!.targetMsgId
        ? {
            ...m,
            text: slot!.streamText || m.text,
            pending: true,
            timeline: [...slot!.timeline],
          }
        : m,
    );
  }
  // 节流落库：token 路径轻量 debounce
  scheduleBgSave(sessionId);
  notify();
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
