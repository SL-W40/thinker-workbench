/**
 * Ã¨ÂÂÃ¥Â¤Â©Ã¤Â¼ÂÃ¨Â¯ÂÃ§ÂÂ¶Ã¦ÂÂÃ¯Â¼ÂÃ¥Â¤ÂÃ¤Â¼ÂÃ¨Â¯Â hydrateÃ£ÂÂÃ¦ÂµÂÃ¥Â¼ÂÃ¤ÂºÂÃ¤Â»Â¶Ã¥ÂÂÃ¥Â¹Â¶Ã£ÂÂÃ¥Â´Â©Ã¦ÂºÂ ResumeÃ£ÂÂÃ©ÂÂ²Ã¦ÂÂÃ¨ÂÂ½Ã¥ÂºÂÃ£ÂÂ
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
import { useT } from "../../i18n/I18nProvider";
import { appLog } from "../../log/sessionLog";
import { createMessage, toAgentHistory, visibleAssistantText } from "./messageModel";
import {
  classifyRunError,
  isSoftStopCode,
  softStopResumeKind,
} from "./runErrors";
import {
  appendError,
  appendReplyText,
  appendShellLiveOutput,
  appendThinkingText,
  applyHitlRequest,
  applyHitlResolved,
  applyStatus,
  applyToolEvent,
  bindShellSessionId,
  freezeTimelineHistory,
  deactivateAll,
  isDeleteRestoreExpired,
  pruneExpiredDeleteRestoreCaches,
  readDeleteFileRestoreTtlDays,
} from "./timelineModel";
import { extractContextPaths } from "./composerMentions";
import {
  EMPTY_USAGE,
  addUsage,
  estimatePartialUsage,
  totalTokens,
} from "./usageStats";

/** Ã¦ÂÂ¶Ã©ÂÂÃ¥ÂÂ©Ã¦ÂÂÃ¦Â°ÂÃ¦Â³Â¡Ã¤Â¹ÂÃ¥ÂÂÃ§ÂÂÃ¥ÂÂ¯Ã¨Â§ÂÃ¥ÂÂÃ¥ÂÂ²Ã¯Â¼ÂÃ¤Â¾ÂÃ¤Â¸Â­Ã¦ÂÂ­Ã¦ÂÂ¶Ã§Â²ÂÃ¤Â¼Â° inputÃ£ÂÂ */
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

/** Ã¦Â¯ÂÃ¨Â¾ÂÃ¤Â¸Â¤Ã¦ÂÂ¡Ã¦ÂÂ¶Ã©ÂÂ´Ã§ÂºÂ¿Ã¯Â¼ÂÃ¤Â¿ÂÃ§ÂÂÃ¥Â·Â¥Ã¥ÂÂ·Ã¨Â¡ÂÃ¤Â¸Â diff Ã¦ÂÂ´Ã¥Â®ÂÃ¦ÂÂ´Ã§ÂÂÃ¤Â¸ÂÃ¤Â¾Â§Ã£ÂÂ */
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

/** 结算消息级耗时（把 live 段写入 durationMs）。 */
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
 * 将失败收束为助手气泡内的错误时间线步（不改成 System 角色）。
 * 保留已流式的正文；错误只出现在 timeline。失败时一并结算耗时。
 */
function failAssistantMessage(
  message: ChatMessage,
  errorText: string,
  timeline: ChatTimelineStep[],
  /** 显式错误码；省略时从文案推断。 */
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

/**
 * Ã¥ÂÂÃ¥ÂÂ Resume Ã¥Â¤Â±Ã¨Â´Â¥Ã¦ÂÂ¶Ã¦ÂÂ°Ã¥Â»ÂºÃ§ÂÂÃ§Â©ÂºÃ¥Â£Â³Ã¥ÂÂ©Ã¦ÂÂÃ¦Â°ÂÃ¦Â³Â¡Ã¯Â¼ÂÃ¦ÂÂ Ã¦Â­Â£Ã¦ÂÂÃ£ÂÂÃ¦ÂÂ¶Ã©ÂÂ´Ã§ÂºÂ¿Ã¤Â»Â errorÃ¯Â¼ÂÃ£ÂÂ
 * Resume Ã¦ÂÂ¶Ã¥ÂºÂÃ¤Â¸Â¢Ã¦ÂÂÃ¯Â¼ÂÃ§Â»Â§Ã§Â»Â­Ã¥ÂÂÃ¥ÂÂÃ§ÂÂÃ¦Â­Â£Ã§ÂÂÃ©ÂÂ£Ã¦ÂÂ¡Ã¥ÂÂ©Ã¦ÂÂÃ¦Â¶ÂÃ¦ÂÂ¯Ã£ÂÂ
 */
function isResumeStubMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.text?.trim()) return false;
  const steps = message.timeline ?? [];
  return steps.length > 0 && steps.every((s) => s.kind === "error");
}

/**
 * Ã¤Â»ÂÃ§Â£ÂÃ§ÂÂ hydrate Ã¦ÂÂ¶Ã¦ÂÂ¶Ã¦ÂÂÃ£ÂÂÃ¨Â¿ÂÃ§Â¨ÂÃ¥Â·Â²Ã¦Â­Â»Ã¤Â½ÂÃ¤Â»Â activeÃ£ÂÂÃ§ÂÂÃ¦ÂÂ¶Ã©ÂÂ´Ã§ÂºÂ¿Ã£ÂÂ
 * - cancelled / crashedÃ¯Â¼ÂÃ¤Â¿ÂÃ§ÂÂ pending Ã¤Â»Â¥Ã¤Â¾Â¿ ResumeÃ¯Â¼ÂÃ¤Â½ÂÃ¥ÂÂ³Ã¦ÂÂ thinking shimmer
 * - Ã¥ÂÂ¶Ã¥Â®ÂÃ§Â»ÂÃ¦ÂÂÃ¯Â¼Âpending Ã¤Â¸ÂÃ¥Â¹Â¶Ã¦Â¸ÂÃ¦ÂÂÃ¯Â¼ÂÃ©ÂÂ¿Ã¥ÂÂÃ¦Â°Â¸Ã¨Â¿Â Planning
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
    // 崩溃 / 取消恢复：补一条软中断，便于时间线展示「继续」
    if (
      resumable &&
      !timeline.some((s) => s.kind === "error" && isSoftStopCode(s.code))
    ) {
      const softCode = runStatus === "crashed" ? "PROCESS_EXIT" : "CANCELLED";
      const softMsg =
        softCode === "PROCESS_EXIT" ? "Exited unexpectedly." : "Stopped.";
      timeline = appendError(timeline, softMsg, softCode);
    }
    // 仅用已冻结的思考耗时回填消息耗时；绝不 Date.now()-runStartedAt
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
      pending: resumable ? base.pending : false,
      timeline,
    };
  });
}

function scrollElToBottom(el: HTMLElement | null, behavior: ScrollBehavior = "smooth") {
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior });
}

/**
 * @param visible Ã¨ÂÂÃ¥Â¤Â©Ã©Â¡ÂµÃ¦ÂÂ¯Ã¥ÂÂ¦Ã¥ÂÂ¨Ã¥ÂÂÃ¥ÂÂ°Ã£ÂÂÃ§Â¦Â»Ã¥Â¼ÂÃ¥ÂÂÃ¥ÂÂÃ¦ÂÂ¥Ã¦ÂÂ¶Ã§ÂÂ¨Ã¤ÂºÂÃ§Â«ÂÃ¥ÂÂ»Ã¥ÂÂ· token Ã¥Â¹Â¶Ã¦Â»ÂÃ¥ÂÂ°Ã¥ÂºÂÃ£ÂÂ
 */
export function useChatSession(visible = true) {
  const t = useT();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>();
  /** Ã¥Â½ÂÃ¥ÂÂÃ¤Â¾Â§Ã¦Â Â / Ã¨Â¾ÂÃ¥ÂÂ¥Ã¦Â¡ÂÃ¥Â±ÂÃ§Â¤ÂºÃ§ÂÂÃ¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´Ã¯Â¼ÂÃ¥ÂÂ¯Ã¤Â¸ÂÃ¦Â´Â»Ã¥ÂÂ¨Ã¤Â¼ÂÃ¨Â¯ÂÃ¥ÂÂÃ¦Â­Â¥Ã¯Â¼ÂÃ£ÂÂ */
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  /** cancelledÃ¯Â¼ÂÃ¤Â»ÂÃ¦ÂÂ¶Ã©ÂÂ´Ã§ÂºÂ¿Ã¥ÂÂ¯Ã§Â»Â­Ã¯Â¼ÂcrashedÃ¯Â¼ÂÃ¨Â¾ÂÃ¥ÂÂ¥Ã¥ÂÂºÃ¤Â¹ÂÃ¦ÂÂÃ§Â¤ÂºÃ¦Â£ÂÃ¦ÂÂ¥Ã§ÂÂ¹Ã§Â»Â­Ã¨Â·ÂÃ£ÂÂ */
  const [resumeKind, setResumeKind] = useState<null | "cancelled" | "crashed">(null);
  const canResume = resumeKind != null;
  const setCanResume = (v: boolean | "cancelled" | "crashed") => {
    if (v === false) setResumeKind(null);
    else if (v === true) setResumeKind("cancelled");
    else setResumeKind(v);
  };
  /** Ã¥ÂÂÃ©ÂÂÃ¥ÂÂÃ§Â¼ÂºÃ¥Â°ÂÃ¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´ / Ã¤Â¼ÂÃ¨Â¯ÂÃ¦ÂÂ¶Ã§ÂÂÃ©ÂÂ¨Ã§Â¦ÂÃ¯Â¼ÂÃ¦ÂÂ¾Ã§Â¤ÂºÃ¥ÂÂ¨Ã¨Â¾ÂÃ¥ÂÂ¥Ã¦Â¡ÂÃ¤Â¸ÂÃ¦ÂÂ¹Ã¯Â¼ÂÃ£ÂÂ */
  const [workspaceGate, setWorkspaceGate] = useState<{
    kind: "no-workspace" | "need-session";
    message: string;
  } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  /** Ã¦Â­Â£Ã¥ÂÂ¨Ã¥ÂÂÃ¤Â½ÂÃ§Â¼ÂÃ¨Â¾ÂÃ§ÂÂÃ§ÂÂ¨Ã¦ÂÂ·Ã¦Â¶ÂÃ¦ÂÂ¯Ã¯Â¼ÂÃ¦ÂÂªÃ¥ÂÂÃ©ÂÂÃ¥ÂÂÃ¤Â¸ÂÃ¦ÂÂ¹Ã¥ÂÂÃ¥ÂÂ²Ã£ÂÂ */
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editingUserIdRef = useRef<string | null>(null);
  const editDraftRef = useRef("");
  const activeRunId = useRef<string | null>(null);
  const targetMsgId = useRef<string | null>(null);
  const runEpoch = useRef(0);
  /** Ã¤Â¼ÂÃ¨Â¯ÂÃ¥ÂÂÃ¦ÂÂ¢Ã¦ÂÂ¶Ã©ÂÂÃ¥Â¢ÂÃ¯Â¼ÂÃ¤Â¸Â¢Ã¥Â¼ÂÃ¨Â¿ÂÃ¥ÂÂ°Ã¤ÂºÂÃ¤Â»Â¶Ã£ÂÂ */
  const sessionEpoch = useRef(0);
  const streamText = useRef("");
  /** Ã¨ÂÂªÃ¤Â¸ÂÃ¦Â¬Â¡Ã¥Â®ÂÃ¦ÂÂ¹ usage Ã¤Â»Â¥Ã¦ÂÂ¥Ã¦ÂÂªÃ¥ÂÂ¥Ã¨Â´Â¦Ã§ÂÂÃ¥ÂÂÃ¥Â¤ÂÃ¦Â­Â£Ã¦ÂÂÃ¯Â¼ÂÃ¤Â¸Â­Ã¦ÂÂ­Ã¤Â¼Â°Ã§Â®ÂÃ§ÂÂ¨Ã¯Â¼ÂÃ£ÂÂ */
  const unbilledReply = useRef("");
  /** Ã¨ÂÂªÃ¤Â¸ÂÃ¦Â¬Â¡Ã¥Â®ÂÃ¦ÂÂ¹ usage Ã¤Â»Â¥Ã¦ÂÂ¥Ã¦ÂÂªÃ¥ÂÂ¥Ã¨Â´Â¦Ã§ÂÂÃ¦ÂÂÃ¨ÂÂÃ¦ÂÂÃ¦ÂÂ¬Ã¯Â¼ÂÃ¤Â¸Â­Ã¦ÂÂ­Ã¤Â¼Â°Ã§Â®ÂÃ§ÂÂ¨Ã¯Â¼ÂÃ£ÂÂ */
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
   * Ã¥ÂÂÃ¥ÂÂºÃ¦ÂÂªÃ¥ÂÂ¥Ã¨Â´Â¦Ã¦ÂµÂÃ¥Â¼ÂÃ¦ÂÂÃ¦ÂÂ¬Ã§ÂÂÃ§Â²ÂÃ¤Â¼Â° usageÃ¯Â¼ÂÃ¥Â¹Â¶Ã¦Â¸ÂÃ§Â©ÂºÃ§Â¼ÂÃ¥ÂÂ²Ã£ÂÂ
   * Ã¥Â°ÂÃ¦ÂÂ Ã¥Â®ÂÃ¦ÂÂ¹ input Ã¦ÂÂ¶Ã¯Â¼ÂÃ©Â¡ÂºÃ¥Â¸Â¦Ã§ÂÂ¨Ã¥ÂÂ¯Ã¨Â§ÂÃ¥ÂÂÃ¥ÂÂ²Ã§Â²ÂÃ¤Â¼Â° inputÃ£ÂÂ
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

  /** Ã¤Â¸Â­Ã¦ÂÂ­ / Ã¥ÂÂÃ¦Â¶ÂÃ¦ÂÂ¶Ã¦ÂÂÃ¦ÂÂ¶Ã¦ÂÂÃ§Â²ÂÃ¤Â¼Â° usage Ã¦ÂÂÃ¨Â¿ÂÃ¥ÂÂ©Ã¦ÂÂÃ¦Â¶ÂÃ¦ÂÂ¯Ã£ÂÂ */
  function withUnbilledUsageEstimate(message: ChatMessage): ChatMessage {
    const delta = consumeUnbilledUsageEstimate(message.id, message.usage);
    if (!delta) return message;
    return { ...message, usage: addUsage(message.usage ?? EMPTY_USAGE, delta) };
  }

  /** Ã§Â»ÂÃ§ÂÂ®Ã¦Â ÂÃ¥ÂÂ©Ã¦ÂÂÃ¦Â¶ÂÃ¦ÂÂ¯Ã§Â´Â¯Ã¥ÂÂ  usageÃ¯Â¼ÂÃ¦Â¶ÂÃ¦ÂÂ¯Ã§ÂºÂ§Ã¯Â¼ÂÃ£ÂÂ */
  function patchTargetUsage(delta: ChatMessage["usage"]) {
    if (!delta) return;
    const id = targetMsgId.current;
    if (!id) return;
    // Ã¥Â®ÂÃ¦ÂÂ¹ usage Ã¥Â·Â²Ã¨Â¦ÂÃ§ÂÂÃ¦ÂÂ¬Ã¦Â®ÂµÃ¦ÂµÂÃ¥Â¼ÂÃ¨Â¾ÂÃ¥ÂÂºÃ¯Â¼ÂÃ¦Â¸ÂÃ§Â©ÂºÃ¦ÂÂªÃ¥ÂÂ¥Ã¨Â´Â¦Ã§Â¼ÂÃ¥ÂÂ²Ã¤Â»Â¥Ã¥ÂÂÃ¤Â¸Â­Ã¦ÂÂ­Ã¦ÂÂ¶Ã©ÂÂÃ¥Â¤ÂÃ¤Â¼Â°Ã§Â®Â
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

  /** Ã¦ÂÂ¬Ã¨Â½Â®Ã§Â»ÂÃ¦ÂÂÃ¯Â¼ÂÃ¦ÂÂ live Ã¦Â®ÂµÃ¥ÂÂÃ¥ÂÂ¥Ã¦Â¶ÂÃ¦ÂÂ¯ durationMsÃ£ÂÂ */
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

  /** Ã¦ÂÂÃ¦ÂÂ­Ã¥Â½ÂÃ¥ÂÂÃ¨Â¿ÂÃ¨Â¡ÂÃ¤Â½ÂÃ¤Â¸ÂÃ¦ÂÂ¹Ã¦Â¶ÂÃ¦ÂÂ¯Ã¯Â¼ÂÃ¥ÂÂÃ¤Â½ÂÃ©ÂÂÃ¥ÂÂÃ¥ÂÂÃ§ÂÂ¨Ã¯Â¼ÂÃ¥ÂÂÃ¥ÂÂ²Ã§ÂÂ±Ã¦ÂÂªÃ¦ÂÂ­Ã¨Â¦ÂÃ§ÂÂÃ¯Â¼ÂÃ£ÂÂ */
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
    // hydrate / Ã¥ÂÂÃ¤Â¼ÂÃ¨Â¯ÂÃ¥ÂÂÃ©Â¡ÂºÃ¥Â¸Â¦Ã¦Â¸ÂÃ¦ÂÂÃ¥Â·Â²Ã¨Â¿ÂÃ¦ÂÂÃ§ÂÂÃ¦ÂÂ¢Ã¥Â¤ÂÃ§Â¼ÂÃ¥Â­Â
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

  /** Ã¦ÂÂÃ¨Â®Â¾Ã§Â½Â® TTL Ã¥Â®ÂÃ¦ÂÂ¶Ã¦Â¸ÂÃ¦ÂÂÃ¨Â¿ÂÃ¦ÂÂÃ§ÂÂÃ¥ÂÂ Ã©ÂÂ¤Ã¦ÂÂ¢Ã¥Â¤ÂÃ§Â¼ÂÃ¥Â­ÂÃ¯Â¼ÂTTL Ã¥ÂÂÃ¦ÂÂ´Ã¦ÂÂ¶Ã§Â«ÂÃ¥ÂÂ»Ã¥ÂÂÃ¦ÂÂ«Ã¤Â¸ÂÃ©ÂÂÃ£ÂÂ */
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

  /** Ã©ÂÂ²Ã¦ÂÂÃ¨ÂÂ½Ã¥ÂºÂÃ¥Â½ÂÃ¥ÂÂÃ¤Â¼ÂÃ¨Â¯ÂÃ¦Â¶ÂÃ¦ÂÂ¯Ã£ÂÂ */
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

  /** Ã¥ÂÂÃ¦Â­Â¥Ã¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´Ã¥Â±ÂÃ§Â¤ÂºÃ¥ÂÂÃ¤Â¸ÂÃ¦Â Â¹Ã¨Â·Â¯Ã¥Â¾ÂÃ¯Â¼ÂÃ¥ÂÂ«Ã¥ÂÂÃ¥ÂÂÃ¦ÂÂ´Ã¦ÂÂ¶Ã¥ÂÂ·Ã¦ÂÂ°Ã£ÂÂ */
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

  // Ã¥ÂÂ¯Ã¥ÂÂ¨Ã¯Â¼ÂÃ¦ÂÂ¢Ã¥Â¤ÂÃ¤Â¸ÂÃ¦Â¬Â¡Ã¤Â¼ÂÃ¨Â¯ÂÃ¯Â¼ÂÃ¥ÂÂ¦Ã¥ÂÂÃ¦ÂÂ¢Ã¥Â¤ÂÃ¤Â¸ÂÃ¦Â¬Â¡Ã¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´Ã¯Â¼ÂÃ¥ÂÂÃ¥ÂÂ¶Ã¦ÂÂÃ¨Â¿ÂÃ¤Â¼ÂÃ¨Â¯ÂÃ¯Â¼ÂÃ¯Â¼ÂÃ¥ÂÂÃ¥ÂÂ¦Ã¥ÂÂÃ©Â»ÂÃ¨Â®Â¤Ã¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´
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
          const settled = settleLoadedMessages(
            loaded.messages,
            loaded.session.runStatus,
          );
          setMessages(settled);
          messagesRef.current = settled;
          setCanResume(loaded.session.runStatus === "crashed" ? "crashed" : loaded.session.runStatus === "cancelled" ? "cancelled" : false);
          // 把冻结后的耗时写回，避免旧 startedAt 下次刷新再被墙钟拉长
          scheduleSave(settled);
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
      sessionIdRef.current = loaded.session.id;
      setSessionId(loaded.session.id);
      setThreadId(loaded.session.threadId);
      const settled = settleLoadedMessages(
        loaded.messages,
        loaded.session.runStatus,
      );
      setMessages(settled);
      messagesRef.current = settled;
      setCanResume(loaded.session.runStatus === "crashed" ? "crashed" : loaded.session.runStatus === "cancelled" ? "cancelled" : false);
      scheduleSave(settled);
      await setActiveSession(loaded.session.id);
    })();
    return () => {
      cancelled = true;
    };
    // Ã¤Â»ÂÃ¦ÂÂÃ¨Â½Â½Ã¦ÂÂ¶Ã¦ÂÂ¢Ã¥Â¤Â
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ã¥ÂÂ«Ã¥ÂÂÃ§Â­ÂÃ¥ÂÂÃ¦ÂÂ´Ã¦ÂÂ¶Ã¥ÂÂ·Ã¦ÂÂ°Ã¨Â¾ÂÃ¥ÂÂ¥Ã¦Â¡ÂÃ¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´Ã¥ÂÂ
  useEffect(() => {
    if (!workspaceId) return;
    return onWorkspacesChanged(() => {
      void syncWorkspaceLabel(workspaceId);
    });
  }, [workspaceId]);

  /**
   * Ã¤Â¾Â§Ã¦Â ÂÃ¥ÂÂ Ã©ÂÂ¤Ã¤Â¼ÂÃ¨Â¯Â / Ã¦Â¸ÂÃ§Â©ÂºÃ¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´Ã¥ÂÂÃ¯Â¼ÂDB Ã¥Â·Â²Ã¦ÂÂ Ã¥Â½ÂÃ¥ÂÂÃ¤Â¼ÂÃ¨Â¯ÂÃ¯Â¼ÂÃ¤Â½ÂÃ¤Â¸Â»Ã¥ÂÂºÃ¤Â»ÂÃ¥ÂÂ¯Ã¨ÂÂ½Ã¦ÂÂÃ§ÂÂÃ¥ÂÂÃ¥Â­ÂÃ¦Â¶ÂÃ¦ÂÂ¯Ã£ÂÂ
   * Ã§ÂÂÃ¥ÂÂ¬ threads Ã¥ÂÂÃ¦ÂÂ´Ã¯Â¼ÂÃ¨ÂÂ¥Ã¥Â½ÂÃ¥ÂÂÃ¤Â¼ÂÃ¨Â¯ÂÃ¥Â·Â²Ã¤Â¸ÂÃ¥Â­ÂÃ¥ÂÂ¨Ã¥ÂÂÃ¥ÂÂÃ¥ÂÂ°Ã¥ÂÂÃ§Â©ÂºÃ©ÂÂ´Ã¦ÂÂÃ¨Â¿ÂÃ¤Â¼ÂÃ¨Â¯ÂÃ¦ÂÂÃ¦Â¸ÂÃ§Â©ÂºÃ¤Â¸Â»Ã¥ÂÂºÃ£ÂÂ
   */
  async function reconcileIfSessionGone() {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const loaded = await getSession(sid);
    if (loaded) return;
    // Ã§ÂÂ¨Ã¦ÂÂ·Ã¥ÂÂ¯Ã¨ÂÂ½Ã¥Â·Â²Ã¥ÂÂÃ¥ÂÂ°Ã¥ÂÂ«Ã§ÂÂÃ¤Â¼ÂÃ¨Â¯Â
    if (sessionIdRef.current !== sid) return;

    // Ã¤Â¼ÂÃ¨Â¯ÂÃ¥Â·Â²Ã¥ÂÂ Ã¯Â¼ÂÃ¥ÂÂÃ¦Â¶ÂÃ¦ÂÂªÃ¨ÂÂ½Ã¥ÂºÂÃ§ÂÂ saveÃ¯Â¼ÂÃ©ÂÂ¿Ã¥ÂÂ saveMessages Ã¦ÂÂ¥ Session not found / Ã¥ÂÂÃ¥ÂÂÃ¥Â¹Â½Ã§ÂÂµÃ¦ÂÂ°Ã¦ÂÂ®
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
        // Ã¥ÂÂÃ¦Â¬Â¡Ã§Â¡Â®Ã¨Â®Â¤Ã¤Â»ÂÃ¥ÂÂÃ¥ÂÂ¨Ã¥Â·Â²Ã¥ÂÂ Ã¤Â¼ÂÃ¨Â¯ÂÃ¤Â¸ÂÃ¯Â¼ÂÃ©ÂÂ¿Ã¥ÂÂÃ¨Â¦ÂÃ§ÂÂÃ§ÂÂ¨Ã¦ÂÂ·Ã¦ÂÂ°Ã©ÂÂÃ¦ÂÂ©Ã¯Â¼Â
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
          setCanResume(next?.session.runStatus === "crashed" ? "crashed" : next?.session.runStatus === "cancelled" ? "cancelled" : false);
          scheduleSave(msgs);
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
    // Ã¤Â»ÂÃ¦ÂÂÃ¨Â½Â½Ã¨Â®Â¢Ã©ÂÂÃ¯Â¼ÂÃ©ÂÂ»Ã¨Â¾ÂÃ¨Â¯Â» ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Ã§ÂÂ¨ messages/busy Ã¨Â§Â¦Ã¥ÂÂÃ¦Â»ÂÃ¥ÂºÂ
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
      // Ã¤Â»ÂÃ¥Â¤ÂÃ§ÂÂÃ¥Â½ÂÃ¥ÂÂ thread Ã§ÂÂÃ¤ÂºÂÃ¤Â»Â¶Ã¯Â¼ÂÃ¥ÂÂÃ¦ÂÂ¢Ã¤Â¼ÂÃ¨Â¯ÂÃ¥ÂÂÃ¤Â¸Â¢Ã¥Â¼ÂÃ¨Â¿ÂÃ¥ÂÂ°Ã¤ÂºÂÃ¤Â»Â¶Ã¯Â¼Â
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
        event.type !== "tool" &&
        event.type !== "hitl"
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
        const errCode = classifyRunError(event.error);
        const resume = softStopResumeKind(event.error, errCode);
        // 手动取消：仅时间线可续；进程异常：时间线 + 输入区横幅
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
      }
    });

    return () => {
      flushStreamRef.current = null;
      unsub();
    };
    // scheduleSave Ã¨Â¯Â» refÃ¯Â¼ÂÃ¥ÂÂ¿Ã¥ÂÂÃ¥ÂÂ¥Ã¤Â¾ÂÃ¨ÂµÂÃ¤Â»Â¥Ã¥ÂÂÃ©ÂÂÃ¨Â®Â¢Ã¤ÂºÂÃ¤Â»Â¶
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Ã§Â»ÂÃ§Â«Â¯Ã¨Â¾ÂÃ¥ÂÂº Ã¢ÂÂ Ã¦ÂÂ¶Ã©ÂÂ´Ã§ÂºÂ¿ shell Ã¦Â­Â¥Ã©ÂªÂ¤ liveOutput
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

  /** Ã¥ÂÂÃ¦ÂÂ¢Ã¥ÂÂ°Ã¦ÂÂÃ¥Â®ÂÃ¤Â¼ÂÃ¨Â¯ÂÃ¯Â¼Âbusy Ã¦ÂÂ¶Ã§ÂÂ±Ã¤Â¾Â§Ã¦Â ÂÃ¦ÂÂ¦Ã¦ÂÂªÃ£ÂÂ */
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
    setCanResume(loaded?.session.runStatus === "crashed" ? "crashed" : loaded?.session.runStatus === "cancelled" ? "cancelled" : false);
    scheduleSave(msgs);
    setWorkspaceGate(null);
    clearUserEdit();
    setDraft("");
    activeRunId.current = null;
    targetMsgId.current = null;
    streamText.current = "";
    timelineRef.current = [];
  }

  /** Ã¦ÂÂ°Ã¥Â»ÂºÃ¤Â¼ÂÃ¨Â¯ÂÃ¥ÂÂÃ¦Â¿ÂÃ¦Â´Â»Ã§Â©ÂºÃ¨ÂÂÃ¥Â¤Â©Ã£ÂÂ */
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

  /** Ã¥ÂÂ¨Ã¥Â½ÂÃ¥ÂÂÃ¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´Ã¦ÂÂ°Ã¥Â»ÂºÃ¤Â¼ÂÃ¨Â¯ÂÃ¯Â¼ÂÃ¥Â¿Â«Ã¦ÂÂ·Ã©ÂÂ® / Ã¥ÂÂ½Ã¤Â»Â¤Ã§ÂÂ¨Ã¯Â¼ÂÃ¯Â¼ÂÃ¥Â¿ÂÃ§Â¢ÂÃ¦ÂÂ¶Ã¥Â¿Â½Ã§ÂÂ¥Ã£ÂÂ */
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

  /** Ã©ÂÂÃ¤Â¸Â­Ã¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´Ã¯Â¼ÂÃ¨Â®Â°Ã¤Â½ÂÃ©ÂÂÃ¦ÂÂ©Ã¯Â¼ÂÃ¥ÂÂÃ¥ÂÂ°Ã¨Â¯Â¥Ã§Â©ÂºÃ©ÂÂ´Ã¦ÂÂÃ¨Â¿ÂÃ¤Â¼ÂÃ¨Â¯ÂÃ¯Â¼ÂÃ¨ÂÂ¥Ã¦ÂÂ Ã¥ÂÂÃ¦Â¸ÂÃ§Â©ÂºÃ¥Â½ÂÃ¥ÂÂÃ¨ÂÂÃ¥Â¤Â©Ã£ÂÂ */
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
   * @param override Ã¥Â¿Â«Ã¦ÂÂ·Ã¦ÂÂ¹Ã¥Â¼Â / Ã¥ÂÂÃ¤Â½ÂÃ§Â¼ÂÃ¨Â¾ÂÃ§ÂÂÃ¦Â­Â£Ã¦ÂÂÃ£ÂÂ
   * @param replaceUserId Ã¤Â»ÂÃ¨Â¯Â¥Ã§ÂÂ¨Ã¦ÂÂ·Ã¦Â¶ÂÃ¦ÂÂ¯Ã¦ÂÂªÃ¦ÂÂ­Ã¥ÂÂÃ©ÂÂÃ¥ÂÂÃ¯Â¼ÂÃ¦ÂÂªÃ¤Â¼Â Ã¥ÂÂÃ¨Â¿Â½Ã¥ÂÂ Ã¥ÂÂ°Ã¦ÂÂ«Ã¥Â°Â¾Ã£ÂÂ
   */
  async function send(override?: string, replaceUserId?: string | null) {
    const text = (override ?? draft).trim();
    if (!text) return;
    if (busy && !replaceUserId) return;

    // Ã¥Â¿ÂÃ©Â¡Â»Ã¦ÂÂÃ¦Â´Â»Ã¥ÂÂ¨Ã¤Â¼ÂÃ¨Â¯ÂÃ¦ÂÂÃ¥Â±ÂÃ§ÂÂÃ¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´Ã¯Â¼ÂÃ¦ÂÂÃ¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´Ã¦ÂÂ Ã¤Â¼ÂÃ¨Â¯ÂÃ¦ÂÂ¶Ã¨ÂÂªÃ¥ÂÂ¨Ã¥Â»ÂºÃ¤Â¼ÂÃ¨Â¯Â
    // getSession Ã¨Â¿ÂÃ¥ÂÂ { session, messages }Ã¯Â¼ÂÃ¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´Ã¥ÂÂ¨ session.workspaceId
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
    // Ã¥ÂÂ¨Ã¨Â¿Â½Ã¥ÂÂ Ã¦ÂÂ¬Ã¨Â½Â®Ã¦Â°ÂÃ¦Â³Â¡Ã¤Â¹ÂÃ¥ÂÂÃ¥Â¿Â«Ã§ÂÂ§Ã¥ÂÂÃ¥ÂÂ²Ã¯Â¼ÂÃ©ÂÂ¿Ã¥ÂÂÃ¦ÂÂÃ¥Â½ÂÃ¥ÂÂ user / Ã§Â©ÂºÃ¥ÂÂ©Ã¦ÂÂÃ¤Â¹ÂÃ¥Â¡ÂÃ¨Â¿ÂÃ¦Â¨Â¡Ã¥ÂÂÃ¤Â¸ÂÃ¤Â¸ÂÃ¦ÂÂ
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
      const contextPaths = extractContextPaths(text);
      const result = await runAgent({
        message: text,
        history,
        threadId: runThreadId,
        traceId,
        ...(contextPaths.length > 0 ? { contextPaths } : {}),
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
      if (epoch === runEpoch.current) {
        if (raf.current != null) {
          window.cancelAnimationFrame(raf.current);
          raf.current = null;
        }
        endMessageClock(pending.id);
        setBusy(false);
        inputRef.current?.focus();
      }
    }
  }

  async function resume() {
    if (!threadId || busy) return;

    // Ã§Â»Â­Ã¥ÂÂÃ¥ÂÂÃ¥ÂÂÃ©ÂÂ£Ã¦ÂÂ¡Ã¥ÂÂ©Ã¦ÂÂÃ¦Â¶ÂÃ¦ÂÂ¯Ã¯Â¼ÂÃ¤Â¸Â¢Ã¦ÂÂÃ¦ÂÂ«Ã¥Â°Â¾Ã§Â©ÂºÃ¥Â£Â³Ã©ÂÂÃ¨Â¯Â¯Ã¦Â°ÂÃ¦Â³Â¡Ã¯Â¼ÂÃ¥ÂÂÃ¥ÂÂÃ¦ÂÂÃ¥ÂÂÃ¤Â¸ÂÃ¦ÂÂ¡ assistant
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
    // Ã¦Â¸ÂÃ¦ÂÂÃ¤Â¸ÂÃ¦Â¬Â¡Ã¥Â¤Â±Ã¨Â´Â¥Ã¦Â®ÂÃ§ÂÂÃ§ÂÂ error Ã¦Â­Â¥Ã¯Â¼ÂÃ¤Â¿ÂÃ§ÂÂÃ¥Â·Â²Ã¦ÂÂÃ¦Â­Â£Ã¦ÂÂ / Ã¥Â·Â¥Ã¥ÂÂ·Ã¦ÂÂ¶Ã©ÂÂ´Ã§ÂºÂ¿
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
        const resumeKind = softStopResumeKind(errText);
        // 进程被热重载 / 退出打断：保留 pending，可再次 Resume；并补软中断行
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
        return;
      }
      // done Ã¤ÂºÂÃ¤Â»Â¶Ã¥ÂÂ¯Ã¨ÂÂ½Ã¥Â·Â²Ã¥ÂÂÃ¥Â®ÂÃ¯Â¼ÂÃ¨ÂÂ¥Ã¤Â»Â pending Ã¥ÂÂÃ§ÂÂ¨ result Ã¦ÂÂ¶Ã¦ÂÂ
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
    // Ã¥ÂÂÃ¦ÂÂÃ¦ÂÂ­Ã¤ÂºÂÃ¤Â»Â¶Ã§ÂÂ®Ã¦Â ÂÃ¯Â¼ÂÃ©ÂÂ¿Ã¥ÂÂÃ¨Â¿ÂÃ¥ÂÂ°Ã§ÂÂ error Ã¥ÂÂÃ¥ÂÂÃ¤Â¸ÂÃ¦ÂÂ¡
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
          // Ã¦ÂµÂÃ¦ÂÂ«Ã¥ÂÂ usage Ã¥Â¸Â¸Ã©ÂÂÃ¤Â¸Â­Ã¦ÂÂ­Ã¤Â¸Â¢Ã¥Â¤Â±Ã¯Â¼ÂÃ§ÂÂ¨Ã¦ÂÂªÃ¥ÂÂ¥Ã¨Â´Â¦Ã¦Â­Â£Ã¦ÂÂ / Ã¦ÂÂÃ¨ÂÂÃ§Â²ÂÃ¤Â¼Â°
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
    // Ã¦ÂÂÃ¥ÂÂ¨Ã¥ÂÂÃ¦Â­Â¢Ã¯Â¼ÂÃ¦ÂÂ¶Ã©ÂÂ´Ã§ÂºÂ¿Ã¥ÂÂ¯Ã£ÂÂÃ§Â»Â§Ã§Â»Â­Ã£ÂÂÃ¯Â¼ÂÃ¨Â¾ÂÃ¥ÂÂ¥Ã¥ÂÂºÃ¤Â¸ÂÃ¥Â¼Â¹Ã¦Â£ÂÃ¦ÂÂ¥Ã§ÂÂ¹Ã¦Â¨ÂªÃ¥Â¹Â
    setCanResume("cancelled");
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
   * Ã§ÂÂ¹Ã¥ÂÂ»Ã¥Â·Â²Ã¥ÂÂÃ©ÂÂÃ§ÂÂÃ§ÂÂ¨Ã¦ÂÂ·Ã¦Â¶ÂÃ¦ÂÂ¯Ã¯Â¼ÂÃ¥ÂÂÃ¤Â½ÂÃ¨Â¿ÂÃ¥ÂÂ¥Ã§Â¼ÂÃ¨Â¾ÂÃ¯Â¼ÂÃ¥ÂÂÃ¥ÂÂ²Ã¤Â¸ÂÃ¥ÂÂ¨Ã¯Â¼ÂÃ¥ÂÂÃ©ÂÂÃ¦ÂÂ¶Ã¦ÂÂÃ¤Â»ÂÃ¨Â¯Â¥Ã¦ÂÂ¡Ã¦ÂÂªÃ¦ÂÂ­Ã£ÂÂ
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
   * Ã¦ÂÂ¶Ã©ÂÂ´Ã§ÂºÂ¿ delete_fileÃ£ÂÂÃ¦ÂÂ¢Ã¥Â¤ÂÃ£ÂÂÃ¯Â¼ÂÃ¦ÂÂÃ¥ÂÂ Ã¥ÂÂÃ§Â¼ÂÃ¥Â­ÂÃ§ÂÂÃ¦Â­Â£Ã¦ÂÂÃ¥ÂÂÃ¥ÂÂÃ¥Â·Â¥Ã¤Â½ÂÃ¥ÂÂºÃ¯Â¼ÂÃ¥Â¹Â¶Ã¦Â ÂÃ¨Â®Â° restoredÃ£ÂÂ
   * Ã¥Â¤Â±Ã¨Â´Â¥Ã¦ÂÂ¶Ã¦ÂÂÃ©ÂÂÃ¯Â¼ÂÃ¤Â¾ÂÃ¥ÂÂ¡Ã§ÂÂÃ¥Â±ÂÃ§Â¤ÂºÃ¦ÂÂÃ§Â¤ÂºÃ£ÂÂ
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
      // Ã¥Â·Â²Ã¨Â¶ÂÃ¦ÂÂ¶Ã¯Â¼ÂÃ¦Â¸ÂÃ§Â¼ÂÃ¥Â­ÂÃ¯Â¼ÂÃ¤Â¸ÂÃ¥ÂÂ¯Ã¥ÂÂÃ¦ÂÂ¢Ã¥Â¤Â
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
    /** Ã¤Â»ÂÃ¥Â´Â©Ã¦ÂºÂÃ§Â­ÂÃ¥Â¼ÂÃ¥Â¸Â¸Ã¤Â¸Â­Ã¦ÂÂ­Ã¦ÂÂ¶Ã¥ÂÂ¨Ã¨Â¾ÂÃ¥ÂÂ¥Ã¥ÂÂºÃ¤Â¸ÂÃ¦ÂÂ¹Ã¦ÂÂÃ§Â¤ÂºÃ¦Â£ÂÃ¦ÂÂ¥Ã§ÂÂ¹Ã§Â»Â­Ã¨Â·ÂÃ£ÂÂ */
    composerResume: resumeKind === "crashed",
    workspaceGate,
    /** Ã©ÂÂ¨Ã§Â¦ÂÃ£ÂÂÃ¦ÂÂÃ¥Â¼ÂÃ£ÂÂÃ¯Â¼ÂÃ©ÂÂÃ§ÂÂ®Ã¥Â½ÂÃ¥Â»ÂºÃ¥Â·Â¥Ã¤Â½ÂÃ§Â©ÂºÃ©ÂÂ´Ã¥Â¹Â¶Ã¨Â¿ÂÃ¥ÂÂ¥Ã¦ÂÂ°Ã¤Â¼ÂÃ¨Â¯ÂÃ£ÂÂ */
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
