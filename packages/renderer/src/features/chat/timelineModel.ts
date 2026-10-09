/**
 * 助手气泡内运行时间线的归并逻辑
 *（status / tool / thinking / reply 叙述 → ChatTimelineStep[]）。
 */
import {
  type AgentEvent,
  type ChatMessage,
  type ChatTimelineStep,
  createId,
  DEFAULT_DELETE_FILE_RESTORE_TTL_DAYS,
} from "@thinker-workbench/shared";

const THINKING_SUMMARY_MAX = 140;
/** 无正文且短于此时长的思考步视为噪声，合并/丢弃。 */
const EPHEMERAL_THINKING_MS = 500;

/** 截断到 max 字符，末尾加省略号。 */
function truncatePhrase(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * 从思考正文抽出一行短摘要（偏结论 / 下一步）。
 * 取末尾 1～2 个完整句；无句读时退回末尾片段。
 */
export function summarizeThinking(text: string, maxLen = THINKING_SUMMARY_MAX): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const parts = cleaned
    .split(/(?<=[。！？.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return truncatePhrase(cleaned, maxLen);

  let phrase =
    parts.length >= 2
      ? `${parts[parts.length - 2]}${parts[parts.length - 1]}`
      : parts[parts.length - 1]!;
  if (phrase.length > maxLen && parts.length >= 2) {
    phrase = parts[parts.length - 1]!;
  }
  return truncatePhrase(phrase, maxLen);
}

/** 无正文的短思考可丢弃，避免连续叠多条「已思考」。 */
function isEphemeralThought(step: ChatTimelineStep): boolean {
  if (step.kind !== "status" || step.status !== "thinking") return false;
  if (step.active) return false;
  if (step.text?.trim()) return false;
  const ms = step.durationMs;
  return ms == null || ms < EPHEMERAL_THINKING_MS;
}

/** planning 从不入库持久展示；一有实质内容就清掉。 */
function dropPlanning(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  const next = steps.filter((s) => !(s.kind === "status" && s.status === "planning"));
  return next.length === steps.length ? steps : next;
}

/** 去掉末尾连续的空壳思考，并清掉 planning。 */
function dropTrailingEphemeralThoughts(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  const base = dropPlanning(steps);
  let end = base.length;
  while (end > 0 && isEphemeralThought(base[end - 1]!)) end -= 1;
  return end === base.length ? base : base.slice(0, end);
}

/** 结束一条仍在活动的 status；thinking 必定带上 durationMs。 */
function finalizeStatusStep(
  step: Extract<ChatTimelineStep, { kind: "status" }>,
): Extract<ChatTimelineStep, { kind: "status" }> {
  if (!step.active) {
    if (step.status === "thinking" && step.durationMs == null) {
      const ms = step.startedAt != null ? Math.max(0, Date.now() - step.startedAt) : 0;
      return { ...step, durationMs: ms };
    }
    return step;
  }
  if (step.status === "thinking") {
    const ms =
      step.durationMs ?? (step.startedAt != null ? Math.max(0, Date.now() - step.startedAt) : 0);
    return { ...step, active: false, durationMs: ms };
  }
  return { ...step, active: false };
}

/** 将所有 status 行标为非活动。 */
export function deactivateStatuses(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  return steps.map((s) => (s.kind === "status" ? finalizeStatusStep(s) : s));
}

/** 将所有活动行标为非活动。 */
export function deactivateAll(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  return dropTrailingEphemeralThoughts(
    steps.map((s) => {
      if (s.kind === "status") return finalizeStatusStep(s);
      if (s.kind === "tool") return { ...s, active: false };
      return s;
    }),
  );
}

/**
 * 追加或刷新 thinking 状态行。
 * `planning` 不入库——由 UI 在空闲时临时展示，有 thinking/工具/正文即消失。
 */
export function applyStatus(
  steps: ChatTimelineStep[],
  status: "planning" | "thinking",
): ChatTimelineStep[] {
  // planning 仅作 UI 占位信号：清掉历史 planning 即可
  if (status === "planning") {
    return dropPlanning(steps);
  }

  const withoutPlanning = dropPlanning(steps);
  const last = withoutPlanning[withoutPlanning.length - 1];
  // 同一段仍在进行中：保持 startedAt
  if (last?.kind === "status" && last.status === "thinking" && last.active) {
    return withoutPlanning;
  }

  // 末尾空壳思考：重新打开，而不是再叠一条
  if (last?.kind === "status" && last.status === "thinking" && !last.active && !last.text?.trim()) {
    return [
      ...withoutPlanning.slice(0, -1),
      {
        ...last,
        active: true,
        startedAt: Date.now(),
        durationMs: undefined,
        summary: undefined,
      },
    ];
  }

  const cleaned = dropTrailingEphemeralThoughts(deactivateStatuses(withoutPlanning));
  return [
    ...cleaned,
    {
      id: createId("tl"),
      kind: "status",
      status: "thinking",
      active: true,
      startedAt: Date.now(),
    },
  ];
}

/**
 * 把 reply 叙述追加进时间线：接在末尾 text 步后连写，否则新开一步。
 * 结束当前思考时丢掉空壳短步，避免「已思考 0.1s」连刷。
 */
export function appendReplyText(steps: ChatTimelineStep[], text: string): ChatTimelineStep[] {
  if (!text) return steps;
  const next = dropTrailingEphemeralThoughts(deactivateStatuses(steps));
  const last = next[next.length - 1];
  if (last?.kind === "text") {
    return [...next.slice(0, -1), { ...last, text: `${last.text}${text}` }];
  }
  return [
    ...next,
    {
      id: createId("tl"),
      kind: "text",
      text,
    },
  ];
}

/**
 * 把文本追加到思考行。
 * 优先写当前活动行；若已结束（例如 tool start 先把思考收束），续写最近一条，
 * 避免留下不可展开的空「已思考 Xs」。
 */
export function appendThinkingText(steps: ChatTimelineStep[], text: string): ChatTimelineStep[] {
  if (!text) return steps;

  let idx = -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.kind === "status" && s.status === "thinking" && s.active) {
      idx = i;
      break;
    }
  }

  // 无活动行时，续写最近一条已结束的思考（迟到的 reasoning）
  if (idx < 0) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      if (s.kind === "status" && s.status === "thinking") {
        idx = i;
        break;
      }
    }
  }

  let next = steps;
  if (idx < 0) {
    next = applyStatus(steps, "thinking");
    idx = next.length - 1;
  }

  const step = next[idx];
  if (!step || step.kind !== "status") return next;

  const fullText = `${step.text ?? ""}${text}`;
  const stillActive = step.active;
  const updated: ChatTimelineStep = {
    ...step,
    active: stillActive,
    text: fullText,
    summary: summarizeThinking(fullText),
    startedAt: step.startedAt ?? Date.now(),
    // 已结束的行保留耗时；活动中清掉，等 finalize 再算
    durationMs: stillActive ? undefined : step.durationMs,
  };

  return next.map((s, i) => {
    if (i === idx) return updated;
    if (stillActive && s.kind === "status") return finalizeStatusStep(s);
    return s;
  });
}

/** 应用 tool start/end，按 callId（或 name+path）合并。 */
export function applyToolEvent(
  steps: ChatTimelineStep[],
  event: Extract<AgentEvent, { type: "tool" }>,
): ChatTimelineStep[] {
  const next = dropTrailingEphemeralThoughts(deactivateStatuses(steps));

  const matchIndex = next.findIndex((s) => {
    if (s.kind !== "tool") return false;
    if (event.callId && s.callId) return s.callId === event.callId;
    return s.name === event.name && s.phase === "start" && s.active;
  });

  if (event.phase === "start") {
    if (matchIndex >= 0) {
      const prev = next[matchIndex];
      if (prev.kind !== "tool") return next;
      const copy = [...next];
      copy[matchIndex] = {
        ...prev,
        path: event.path ?? prev.path,
        summary: event.summary ?? prev.summary,
        diff: event.diff ?? prev.diff,
        ...mergeRestoreCache(prev, event),
        phase: "start",
        active: true,
      };
      return copy;
    }
    return [
      ...next,
      {
        id: createId("tl"),
        kind: "tool",
        name: event.name,
        callId: event.callId,
        path: event.path,
        summary: event.summary,
        diff: event.diff,
        ...mergeRestoreCache(undefined, event),
        phase: "start",
        active: true,
      },
    ];
  }

  // end：带上 diff / restoreContent（即使此前 start 行没有）
  if (matchIndex >= 0) {
    const prev = next[matchIndex];
    if (prev.kind !== "tool") return next;
    const copy = [...next];
    copy[matchIndex] = {
      ...prev,
      phase: "end",
      active: false,
      path: event.path ?? prev.path,
      summary: event.summary ?? prev.summary,
      ok: event.ok,
      diff: event.diff ?? prev.diff,
      ...mergeRestoreCache(prev, event),
    };
    return copy;
  }

  return [
    ...next,
    {
      id: createId("tl"),
      kind: "tool",
      name: event.name,
      callId: event.callId,
      path: event.path,
      summary: event.summary,
      phase: "end",
      ok: event.ok,
      diff: event.diff,
      ...mergeRestoreCache(undefined, event),
      active: false,
    },
  ];
}

/** 合并删除恢复缓存；新带上 restoreContent 时打戳。 */
function mergeRestoreCache(
  prev: Extract<ChatTimelineStep, { kind: "tool" }> | undefined,
  event: Extract<AgentEvent, { type: "tool" }>,
): { restoreContent?: string; restoreCachedAt?: number; restored?: boolean } {
  if (prev?.restored) return { restored: true };
  const content =
    typeof event.restoreContent === "string"
      ? event.restoreContent
      : prev && typeof prev.restoreContent === "string"
        ? prev.restoreContent
        : undefined;
  if (content === undefined) return {};
  const cachedAt =
    typeof event.restoreCachedAt === "number"
      ? event.restoreCachedAt
      : typeof prev?.restoreCachedAt === "number"
        ? prev.restoreCachedAt
        : Date.now();
  return { restoreContent: content, restoreCachedAt: cachedAt };
}

/** 删除恢复缓存是否已过期（ttlDays=0 表示不过期）。 */
export function isDeleteRestoreExpired(
  step: Extract<ChatTimelineStep, { kind: "tool" }>,
  ttlDays: number,
  now = Date.now(),
): boolean {
  if (typeof step.restoreContent !== "string") return true;
  if (ttlDays <= 0) return false;
  const cachedAt = step.restoreCachedAt;
  // 无时间戳的旧数据：视为已过期，不可恢复
  if (typeof cachedAt !== "number" || !Number.isFinite(cachedAt)) return true;
  return now - cachedAt >= ttlDays * 86_400_000;
}

/** 当前设置中的删除恢复 TTL（天）。 */
export function readDeleteFileRestoreTtlDays(): number {
  const sync = window.thinker?.settings?.getGeneralSync?.();
  const n = sync?.deleteFileRestoreTtlDays;
  return typeof n === "number" && Number.isFinite(n)
    ? Math.max(0, Math.floor(n))
    : DEFAULT_DELETE_FILE_RESTORE_TTL_DAYS;
}

/**
 * 清掉消息列表里已过期的 delete_file 恢复缓存。
 * @returns 若有变更则返回新数组，否则返回原引用。
 */
export function pruneExpiredDeleteRestoreCaches(
  messages: ChatMessage[],
  ttlDays: number,
  now = Date.now(),
): ChatMessage[] {
  let changed = false;
  const next = messages.map((m) => {
    if (!m.timeline?.length) return m;
    let timelineChanged = false;
    const timeline = m.timeline.map((s) => {
      if (s.kind !== "tool" || typeof s.restoreContent !== "string") return s;
      if (!isDeleteRestoreExpired(s, ttlDays, now)) return s;
      timelineChanged = true;
      changed = true;
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
        ...(s.restored ? { restored: true as const } : {}),
      };
    });
    return timelineChanged ? { ...m, timeline } : m;
  });
  return changed ? next : messages;
}

/**
 * 在时间线末尾追加一条错误步（固定格式展示）。
 * 末尾已是 error 时就地更新（同一轮失败事件 / result 收束去重）。
 */
export function appendError(
  steps: ChatTimelineStep[],
  message: string,
  code?: string,
): ChatTimelineStep[] {
  const text = message.trim();
  if (!text) return steps;
  const next = deactivateAll(steps);
  const last = next[next.length - 1];
  if (last?.kind === "error") {
    return [
      ...next.slice(0, -1),
      {
        ...last,
        message: text,
        code: code ?? last.code,
      },
    ];
  }
  return [
    ...next,
    {
      id: createId("tl"),
      kind: "error",
      message: text,
      ...(code ? { code } : {}),
    },
  ];
}
