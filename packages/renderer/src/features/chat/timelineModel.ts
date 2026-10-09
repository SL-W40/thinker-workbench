/**
 * 助手气泡内运行时间线的归并逻辑
 *（status / tool / thinking / reply 叙述 → ChatTimelineStep[]）。
 */
import {
  type AgentEvent,
  type ChatMessage,
  type ChatTimelineStep,
  type HitlRequest,
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

type FinalizeOpts = {
  /**
   * 为 true（默认）时，缺 durationMs 可用 startedAt 按当前墙钟结算（仅实时收束）。
   * hydrate / 读历史必须为 false，否则每次刷新都会把「已思考」拉长。
   */
  wallClock?: boolean;
};

/** 结束一条仍在活动的 status；thinking 带上 durationMs，并清掉 startedAt 防重算。 */
function finalizeStatusStep(
  step: Extract<ChatTimelineStep, { kind: "status" }>,
  opts: FinalizeOpts = {},
): Extract<ChatTimelineStep, { kind: "status" }> {
  const wallClock = opts.wallClock !== false;
  if (step.status === "thinking") {
    // 已冻结过：只保证 inactive，清掉 startedAt
    if (!step.active && step.durationMs != null) {
      return step.startedAt != null ? { ...step, startedAt: undefined } : step;
    }
    let ms = step.durationMs;
    if (ms == null && wallClock && step.startedAt != null) {
      ms = Math.max(0, Date.now() - step.startedAt);
    }
    return {
      ...step,
      active: false,
      ...(ms != null ? { durationMs: ms } : {}),
      startedAt: undefined,
    };
  }
  if (!step.active) return step;
  return { ...step, active: false };
}

/** 将所有 status 行标为非活动。 */
export function deactivateStatuses(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  return steps.map((s) => (s.kind === "status" ? finalizeStatusStep(s) : s));
}

/** 将所有活动行标为非活动（实时收束，可用墙钟结算思考耗时）。 */
export function deactivateAll(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  return dropTrailingEphemeralThoughts(
    steps.map((s) => {
      if (s.kind === "status") return finalizeStatusStep(s, { wallClock: true });
      if (s.kind === "tool") return { ...s, active: false };
      return s;
    }),
  );
}

/**
 * 读盘 / hydrate：冻结时间线耗时，禁止用墙钟重算。
 * - 已有 durationMs：保留并去掉 startedAt
 * - 无 durationMs：去掉 startedAt（勿 Date.now()-startedAt），可选用 messageDurationMs 回填
 */
export function freezeTimelineHistory(
  steps: ChatTimelineStep[],
  messageDurationMs?: number,
): ChatTimelineStep[] {
  const fallback =
    messageDurationMs != null && messageDurationMs > 0 ? messageDurationMs : undefined;
  let usedFallback = false;
  const next = steps.map((s) => {
    if (s.kind === "tool" && s.active) return { ...s, active: false };
    if (s.kind !== "status" || s.status !== "thinking") return s;
    if (s.durationMs != null) {
      return { ...s, active: false, startedAt: undefined };
    }
    if (fallback != null && !usedFallback) {
      usedFallback = true;
      return {
        ...s,
        active: false,
        durationMs: fallback,
        startedAt: undefined,
      };
    }
    return { ...s, active: false, startedAt: undefined };
  });
  return dropTrailingEphemeralThoughts(next);
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

  const isShellTool = event.name === "shell" || event.name === "shell_await";
  let matchIndex = -1;
  if (event.callId) {
    matchIndex = next.findIndex(
      (s) => s.kind === "tool" && Boolean(s.callId) && s.callId === event.callId,
    );
  }
  // HITL 预插入的 shell 卡片优先合并，避免再开一张卡
  if (matchIndex < 0 && isShellTool) {
    matchIndex = next.findIndex(
      (s) =>
        s.kind === "tool" &&
        Boolean(s.hitl) &&
        (s.name === "shell" || s.name === "shell_await") &&
        s.phase === "start" &&
        s.active,
    );
  }
  if (matchIndex < 0) {
    matchIndex = next.findIndex(
      (s) =>
        s.kind === "tool" && s.name === event.name && s.phase === "start" && s.active,
    );
  }

  if (event.phase === "start") {
    if (matchIndex >= 0) {
      const prev = next[matchIndex];
      if (prev.kind !== "tool") return next;
      const copy = [...next];
      copy[matchIndex] = {
        ...prev,
        callId: event.callId ?? prev.callId,
        path: event.path ?? prev.path,
        summary: event.summary ?? prev.summary,
        diff: event.diff ?? prev.diff,
        sessionId: event.sessionId ?? prev.sessionId,
        command: event.command ?? prev.command,
        ...mergeRestoreCache(prev, event),
        // 真实 tool start：清掉审批挂载
        hitl: undefined,
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
        sessionId: event.sessionId,
        command: event.command,
        ...mergeRestoreCache(undefined, event),
        phase: "start",
        active: true,
      },
    ];
  }

  // end：带上 diff / restoreContent / shell 会话（即使此前 start 行没有）
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
      sessionId: event.sessionId ?? prev.sessionId,
      command: event.command ?? prev.command,
      exitCode: event.exitCode ?? prev.exitCode,
      backgrounded: event.backgrounded ?? prev.backgrounded,
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
      sessionId: event.sessionId,
      command: event.command,
      exitCode: event.exitCode,
      backgrounded: event.backgrounded,
      ...mergeRestoreCache(undefined, event),
      active: false,
    },
  ];
}

const LIVE_OUTPUT_CAP = 12_000;

/**
 * 把终端输出追加到匹配 sessionId 的 shell 工具步（无 sessionId 时挂到当前活动 shell）。
 * 仅保留尾部 LIVE_OUTPUT_CAP 字符。
 */
export function appendShellLiveOutput(
  steps: ChatTimelineStep[],
  chunk: string,
  sessionId?: string,
): ChatTimelineStep[] {
  if (!chunk) return steps;
  let idx = -1;
  if (sessionId) {
    idx = steps.findIndex((s) => s.kind === "tool" && s.sessionId === sessionId);
  }
  if (idx < 0) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      if (
        s.kind === "tool" &&
        (s.name === "shell" || s.name === "shell_await") &&
        s.phase === "start" &&
        s.active
      ) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return steps;
  const prev = steps[idx];
  if (prev.kind !== "tool") return steps;
  const merged = `${prev.liveOutput ?? ""}${chunk}`;
  const liveOutput =
    merged.length > LIVE_OUTPUT_CAP
      ? merged.slice(merged.length - LIVE_OUTPUT_CAP)
      : merged;
  const copy = [...steps];
  copy[idx] = {
    ...prev,
    sessionId: sessionId ?? prev.sessionId,
    liveOutput,
  };
  return copy;
}

/**
 * HITL 请求：shell_approval 预插入活动 shell 卡片；其它 kind 忽略（走 Modal）。
 */
export function applyHitlRequest(
  steps: ChatTimelineStep[],
  request: HitlRequest,
): ChatTimelineStep[] {
  if (request.kind !== "shell_approval") return steps;
  const command =
    typeof request.payload?.command === "string" ? request.payload.command.trim() : "";
  const next = dropTrailingEphemeralThoughts(deactivateStatuses(steps));
  // 已有同 hitlId 则刷新
  const existing = next.findIndex(
    (s) => s.kind === "tool" && s.hitl?.hitlId === request.hitlId,
  );
  const hitl = {
    hitlId: request.hitlId,
    title: request.title,
    body: request.body,
    actions: request.actions.map((a) => ({
      id: a.id,
      label: a.label,
      style: a.style,
    })),
  };
  if (existing >= 0) {
    const prev = next[existing];
    if (prev.kind !== "tool") return next;
    const copy = [...next];
    copy[existing] = {
      ...prev,
      command: command || prev.command,
      hitl,
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
      name: "shell",
      command: command || undefined,
      summary: command || undefined,
      hitl,
      phase: "start",
      active: true,
    },
  ];
}

/**
 * HITL 已解决：允许则清 hitl 等 tool；拒绝则卡片失败结束。
 */
export function applyHitlResolved(
  steps: ChatTimelineStep[],
  hitlId: string,
  actionId?: string,
): ChatTimelineStep[] {
  const idx = steps.findIndex((s) => s.kind === "tool" && s.hitl?.hitlId === hitlId);
  if (idx < 0) return steps;
  const prev = steps[idx];
  if (prev.kind !== "tool") return steps;
  const denied = actionId === "deny";
  const copy = [...steps];
  copy[idx] = {
    ...prev,
    hitl: undefined,
    phase: denied ? "end" : "start",
    active: !denied,
    ok: denied ? false : prev.ok,
  };
  return copy;
}

/** 终端会话创建时，把 sessionId 绑到当前活动 shell 工具步。 */
export function bindShellSessionId(
  steps: ChatTimelineStep[],
  sessionId: string,
  options?: { runId?: string; command?: string },
): ChatTimelineStep[] {
  if (!sessionId) return steps;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.kind !== "tool") continue;
    if (s.name !== "shell" && s.name !== "shell_await") continue;
    if (s.sessionId && s.sessionId !== sessionId) continue;
    if (s.phase === "start" && s.active) {
      const copy = [...steps];
      copy[i] = {
        ...s,
        sessionId,
        command: options?.command ?? s.command,
      };
      return copy;
    }
  }
  return steps;
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
