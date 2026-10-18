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
  type HitlRequest,
} from "@thinker-workbench/shared";

/** 排队等待文案的时间线 id。出队、失败或取消后整段去掉。 */
export const QUEUED_WAIT_STEP_ID = "queued-wait";

/** 这些事件说明 run 已经开始产出，排队槽应切到 busy。 */
const QUEUE_PROMOTE_EVENTS = new Set([
  "token",
  "status",
  "tool",
  "hitl",
  "subagent",
  "model_switch",
  "usage",
]);

/** 去掉排队等待文案。没有该步时返回原数组。 */
export function stripQueuedWait(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  if (!steps.some((step) => step.id === QUEUED_WAIT_STEP_ID)) return steps;
  return steps.filter((step) => step.id !== QUEUED_WAIT_STEP_ID);
}

/** 用最新名次覆盖排队等待文案。 */
export function withQueuedWait(steps: ChatTimelineStep[], text: string): ChatTimelineStep[] {
  return [...stripQueuedWait(steps), { id: QUEUED_WAIT_STEP_ID, kind: "text", text }];
}

/**
 * 后台槽上的排队过渡：终态去掉等待文案；模型开始输出时标成 busy。
 * 出队前保持不忙，避免侧栏外的会话提前变成「正在跑」。
 */
export function applyQueuedSlotEvent(
  slot: { busy: boolean; timeline: ChatTimelineStep[] },
  eventType: string,
): void {
  if (eventType === "done" || eventType === "error") {
    slot.timeline = stripQueuedWait(slot.timeline);
    return;
  }
  if (!QUEUE_PROMOTE_EVENTS.has(eventType) || slot.busy) return;
  slot.timeline = stripQueuedWait(slot.timeline);
  slot.busy = true;
}

/**
 * 流式 token 可能在句中停住，而 done 的正文更完整。
 * 仅当完整正文以时间线已有叙述为前缀时，把缺的尾巴补进最后一段 text。
 */
export function reconcileTimelineReply(
  steps: ChatTimelineStep[],
  fullText: string,
): ChatTimelineStep[] {
  const full = fullText.trim();
  if (!full) return steps;
  const indexes: number[] = [];
  const parts: string[] = [];
  steps.forEach((step, index) => {
    if (step.kind !== "text") return;
    indexes.push(index);
    parts.push(step.text);
  });
  if (indexes.length === 0) return steps;
  const streamed = parts.join("\n\n");
  if (!full.startsWith(streamed) || full.length === streamed.length) return steps;
  const last = indexes[indexes.length - 1];
  if (last === undefined) return steps;
  const prev = steps[last];
  if (prev?.kind !== "text") return steps;
  const copy = [...steps];
  copy[last] = { ...prev, text: prev.text + full.slice(streamed.length) };
  return copy;
}

/** 截断到 max 字符，末尾加省略号。 */
function truncatePhrase(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * 无正文的已结束思考可丢弃。
 * 常见于：status=thinking 后立刻调工具，模型未流出 reasoning token，
 * 却留下不可展开的「Thought 3.5s」空壳。
 */
function isEphemeralThought(step: ChatTimelineStep): boolean {
  if (step.kind !== "status" || step.status !== "thinking") return false;
  if (step.active) return false;
  return !step.text?.trim();
}

/** planning 从不入库持久展示；一有实质内容就清掉。 */
function dropPlanning(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  const next = steps.filter((s) => !(s.kind === "status" && s.status === "planning"));
  return next.length === steps.length ? steps : next;
}

/** 去掉全部空壳思考，并清掉 planning（不限末尾，避免夹在工具之间）。 */
function dropTrailingEphemeralThoughts(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  const base = dropPlanning(steps);
  const next = base.filter((s) => !isEphemeralThought(s));
  return next.length === base.length ? base : next;
}

/** 单行小结（承上启下）的字符上限；超过按普通回复正文渲染。 */
export const TRANSITION_TEXT_MAX = 60;

/**
 * 判断 text 步是否为「承上启下」小结行：
 * 单行短句（≤60 字、无换行），且其后仍有工具 / 思考步骤（过程叙述而非答复收尾）。
 * 提示词已约束模型仅在关键结论 / 思维转变 / 用户须知时输出这样一行——
 * 命中才以小结样式独立呈现，未命中（长叙述 / 最终答复）维持普通正文。
 */
export function isTransitionTextStep(steps: ChatTimelineStep[], stepId: string): boolean {
  const idx = steps.findIndex((s) => s.kind === "text" && s.id === stepId);
  if (idx < 0) return false;
  const step = steps[idx];
  if (step?.kind !== "text") return false;
  const text = step.text.trim();
  if (!text || text.includes("\n") || text.length > TRANSITION_TEXT_MAX) return false;
  return steps
    .slice(idx + 1)
    .some((s) => s.kind === "tool" || (s.kind === "status" && s.status === "thinking"));
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

/** 会话停止时：仍在跑的子代理收束为 cancelled。 */
function finalizeActiveSubagent(
  step: Extract<ChatTimelineStep, { kind: "subagent" }>,
): Extract<ChatTimelineStep, { kind: "subagent" }> {
  if (step.phase === "finished" || step.phase === "failed" || step.phase === "cancelled") {
    return {
      ...step,
      active: false,
      childTimeline: step.childTimeline ? deactivateAll(step.childTimeline) : undefined,
    };
  }
  return {
    ...step,
    phase: "cancelled",
    active: false,
    liveLine: undefined,
    error: step.error || "Cancelled.",
    childTimeline: step.childTimeline ? deactivateAll(step.childTimeline) : undefined,
  };
}

/** 将所有活动行标为非活动（实时收束，可用墙钟结算思考耗时）；顺带摘掉 HITL 等待态。 */
export function deactivateAll(steps: ChatTimelineStep[]): ChatTimelineStep[] {
  return dropTrailingEphemeralThoughts(
    steps.map((s) => {
      if (s.kind === "status") return finalizeStatusStep(s, { wallClock: true });
      if (s.kind === "tool") {
        const { hitl: _hitl, ...rest } = s;
        return { ...rest, active: false, hitl: undefined };
      }
      if (s.kind === "subagent") return finalizeActiveSubagent(s);
      return s;
    }),
  );
}

/**
 * 比较两条时间线，保留工具行与 diff 更完整的一侧。
 * 本地与 DB 择优、事件流合并 timeline 时共用；平分取本地（左侧）。
 */
export function pickRicherTimeline(
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
 * 承上启下小结的标记行前缀：模型按提示词约定在调工具前输出 `[NEXT] 一句话`。
 */
export const TRANSITION_MARKER = "[NEXT]";

/** 小结内容字符上限（用户要求 ≤50 字）。 */
export const TRANSITION_MARKER_MAX = 50;

/** 标记行正则（整行匹配，g 供全文扫描）。 */
const TRANSITION_LINE_RE = /^[ \t]*\[NEXT\][ \t]*(.*)$/gm;

/**
 * 从一段回复文本里剥离 `[NEXT]` 标记行。
 * 流式累积时标记可能被 token 切开：不完整的行不匹配、原样保留，
 * 待下一片补全后自然被剥离（对同一文本重复调用是安全的）。
 */
export function stripTransitionLines(text: string): string {
  if (!text.includes(TRANSITION_MARKER)) return text;
  return text
    .replace(TRANSITION_LINE_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

/**
 * 剥离标记行并取首个小结内容（≤50 字）。
 */
export function extractTransitionLine(text: string): { cleaned: string; transition?: string } {
  let transition: string | undefined;
  const cleaned = text.replace(TRANSITION_LINE_RE, (_match, body: string) => {
    const trimmed = (body ?? "").trim();
    if (trimmed && !transition) transition = truncatePhrase(trimmed, TRANSITION_MARKER_MAX);
    return "";
  });
  return { cleaned, transition };
}

/**
 * 把 reply 叙述追加进时间线：接在末尾 text 步后连写，否则新开一步。
 * 结束当前思考时丢掉空壳短步，避免「已思考 0.1s」连刷。
 *
 * `[NEXT]` 标记行（模型按提示词在调工具前写的小结）被解析成独立的
 * transition 步骤——插在最近一条思考步之后、工具步之前；标记行本身
 * 从叙述正文里剥离。标记行被 token 切开时按"未完结行"续写。
 */
export function appendReplyText(steps: ChatTimelineStep[], text: string): ChatTimelineStep[] {
  if (!text) return steps;
  const base = dropTrailingEphemeralThoughts(deactivateStatuses(steps));
  const last = base[base.length - 1];

  // 末尾是未完结的标记行（transition 步）：本片段续写该行，直到出现换行
  if (last?.kind === "transition") {
    const nl = text.indexOf("\n");
    if (nl < 0) {
      return [
        ...base.slice(0, -1),
        { ...last, text: truncatePhrase(`${last.text}${text}`, TRANSITION_MARKER_MAX) },
      ];
    }
    const linePart = text.slice(0, nl);
    const rest = text.slice(nl + 1).replace(/^\s+/, "");
    const out: ChatTimelineStep[] = [
      ...base.slice(0, -1),
      {
        ...last,
        text: truncatePhrase(`${last.text}${linePart}`, TRANSITION_MARKER_MAX),
      },
    ];
    if (rest.trim()) {
      out.push({ id: createId("tl"), kind: "text", text: rest.trim() });
    }
    return out;
  }

  const next =
    last?.kind === "text"
      ? [...base.slice(0, -1), { ...last, text: `${last.text}${text}` }]
      : [...base, { id: createId("tl"), kind: "text", text } as ChatTimelineStep];

  const lastIdx = next.length - 1;
  const lastStep = next[lastIdx];
  if (lastStep?.kind !== "text") return next;

  const { cleaned, transition } = extractTransitionLine(lastStep.text);
  if (!transition) return next;

  // 有标记：把该 text 步转成 transition 步（正文残留则另开 text 步接在后面）
  const transitionStep: ChatTimelineStep = {
    id: lastStep.id,
    kind: "transition",
    text: transition,
  };
  const rest = cleaned.trim()
    ? [{ id: createId("tl"), kind: "text", text: cleaned.trim() } as ChatTimelineStep]
    : [];
  return [...next.slice(0, lastIdx), transitionStep, ...rest];
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

  // 无活动行时，仅当最近一条思考行仍是时间线最后一步才续写（迟到的 reasoning）。
  // 若其后已被工具/正文隔开，说明是新一轮思考（新引擎每轮只发 planning 占位），
  // 必须开新行——否则整场 run 的思考会不断追加进同一个块。
  if (idx < 0) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      if (s.kind === "status" && s.status === "thinking") {
        idx = i;
        break;
      }
    }
    if (idx >= 0 && idx < steps.length - 1) {
      idx = -1; // 思考行后已有其他步骤：新一轮，走 applyStatus 新建/重开
    }
  }

  let next = steps;
  if (idx < 0) {
    next = applyStatus(steps, "thinking");
    idx = next.length - 1;
  }

  const step = next[idx];
  if (step?.kind !== "status") return next;

  const fullText = `${step.text ?? ""}${text}`;
  const stillActive = step.active;
  const updated: ChatTimelineStep = {
    ...step,
    active: stillActive,
    text: fullText,
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

  const isShellTool =
    event.name === "shell" || event.name === "shell_await" || event.name === "shell_write";
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
        (s.name === "shell" || s.name === "shell_await" || s.name === "shell_write") &&
        s.phase === "start" &&
        s.active,
    );
  }
  // 事件必须按 callId 精确匹配：同名的并行工具调用是两次独立调用，
  // 同名兜底合并会并掉一张卡并覆盖 callId，导致 end 错乱、思考轮被误判为同一轮。

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
        resultPaths: event.resultPaths ?? prev.resultPaths,
        resultPathKinds: event.resultPathKinds ?? prev.resultPathKinds,
        ...mergeRestoreCache(prev, event),
        // 审批卡片先于真正执行出现。迟到的 tool start 不能把选择按钮抹掉。
        hitl: prev.hitl,
        phase: "start",
        active: true,
        startedAt: event.ts ?? prev.startedAt ?? Date.now(),
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
        startedAt: event.ts ?? Date.now(),
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
      resultPaths: event.resultPaths ?? prev.resultPaths,
      resultPathKinds: event.resultPathKinds ?? prev.resultPathKinds,
      ...mergeRestoreCache(prev, event),
      endedAt: event.ts ?? Date.now(),
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
      resultPaths: event.resultPaths,
      resultPathKinds: event.resultPathKinds,
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
        (s.name === "shell" || s.name === "shell_await" || s.name === "shell_write") &&
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
    merged.length > LIVE_OUTPUT_CAP ? merged.slice(merged.length - LIVE_OUTPUT_CAP) : merged;
  const copy = [...steps];
  copy[idx] = {
    ...prev,
    sessionId: sessionId ?? prev.sessionId,
    liveOutput,
  };
  return copy;
}

/** 这些 HITL 挂在时间线卡片上，不进 Modal。 */
export function isTimelineHitlKind(kind: string): boolean {
  return kind === "shell_approval" || kind === "shell_write_approval" || kind === "clarify";
}

function parseClarifyQuestions(
  payload: Record<string, unknown> | undefined,
): NonNullable<Extract<ChatTimelineStep, { kind: "tool" }>["clarify"]>["questions"] {
  const raw = payload?.questions;
  if (!Array.isArray(raw)) return [];
  const questions: NonNullable<
    Extract<ChatTimelineStep, { kind: "tool" }>["clarify"]
  >["questions"] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; prompt?: unknown; options?: unknown };
    const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
    if (!prompt) continue;
    const id =
      typeof row.id === "string" && row.id.trim() ? row.id.trim() : `q${questions.length + 1}`;
    const options: Array<{ id: string; label: string }> = [];
    if (Array.isArray(row.options)) {
      for (const opt of row.options) {
        if (!opt || typeof opt !== "object") continue;
        const option = opt as { id?: unknown; label?: unknown };
        const label = typeof option.label === "string" ? option.label.trim() : "";
        if (!label) continue;
        const optionId =
          typeof option.id === "string" && option.id.trim()
            ? option.id.trim()
            : `opt_${options.length + 1}`;
        options.push({ id: optionId, label });
      }
    }
    questions.push({ id, prompt, options });
  }
  return questions;
}

function parseClarifyAnswers(values: Record<string, unknown> | undefined) {
  const raw = values?.answers;
  if (!Array.isArray(raw)) return [];
  const answers: NonNullable<
    NonNullable<Extract<ChatTimelineStep, { kind: "tool" }>["clarify"]>["answers"]
  > = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; optionId?: unknown; text?: unknown };
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    const optionId = typeof row.optionId === "string" ? row.optionId.trim() : "";
    const text = typeof row.text === "string" ? row.text.trim() : "";
    answers.push({
      id,
      ...(optionId ? { optionId } : {}),
      ...(text ? { text } : {}),
    });
  }
  return answers;
}

/**
 * HITL 请求：shell 审批与 clarify 挂时间线卡片；其它 kind 走 Modal。
 */
export function applyHitlRequest(
  steps: ChatTimelineStep[],
  request: HitlRequest,
): ChatTimelineStep[] {
  if (request.kind === "clarify") {
    const questions = parseClarifyQuestions(request.payload);
    const next = dropTrailingEphemeralThoughts(deactivateStatuses(steps));
    const clarify = { hitlId: request.hitlId, questions };
    const existing = next.findIndex(
      (s) =>
        s.kind === "tool" &&
        (s.hitl?.hitlId === request.hitlId || s.clarify?.hitlId === request.hitlId),
    );
    if (existing >= 0) {
      const prev = next[existing];
      if (prev.kind !== "tool") return next;
      const copy = [...next];
      copy[existing] = { ...prev, name: "ask_user", clarify, phase: "start", active: true };
      return copy;
    }
    for (let i = next.length - 1; i >= 0; i--) {
      const s = next[i];
      if (
        s.kind === "tool" &&
        s.name === "ask_user" &&
        s.phase === "start" &&
        s.active &&
        !s.clarify
      ) {
        const copy = [...next];
        copy[i] = { ...s, clarify, phase: "start", active: true };
        return copy;
      }
    }
    return [
      ...next,
      {
        id: createId("tl"),
        kind: "tool",
        name: "ask_user",
        summary: questions[0]?.prompt,
        clarify,
        phase: "start",
        active: true,
      },
    ];
  }
  if (request.kind !== "shell_approval" && request.kind !== "shell_write_approval") {
    return steps;
  }
  const parentCommand =
    typeof request.payload?.parentCommand === "string" ? request.payload.parentCommand.trim() : "";
  const dataPreview =
    typeof request.payload?.dataPreview === "string" ? request.payload.dataPreview : "";
  const command =
    typeof request.payload?.command === "string"
      ? request.payload.command.trim()
      : request.kind === "shell_write_approval"
        ? parentCommand
          ? `${parentCommand} ← ${dataPreview || "…"}`
          : dataPreview
            ? `← ${dataPreview}`
            : ""
        : "";
  const toolName = request.kind === "shell_write_approval" ? "shell_write" : "shell";
  const next = dropTrailingEphemeralThoughts(deactivateStatuses(steps));
  // 已有同 hitlId 则刷新
  const existing = next.findIndex((s) => s.kind === "tool" && s.hitl?.hitlId === request.hitlId);
  const reviewReason =
    typeof request.payload?.reviewReason === "string" ? request.payload.reviewReason.trim() : "";
  const hitl = {
    hitlId: request.hitlId,
    title: request.title,
    body: request.body,
    actions: request.actions.map((a) => ({
      id: a.id,
      label: a.label,
      style: a.style,
    })),
    parentCommand: parentCommand || undefined,
    dataPreview: dataPreview || undefined,
    purpose: reviewReason || undefined,
  };
  const sessionId = typeof request.payload?.sessionId === "string" ? request.payload.sessionId : "";

  // 时间线里同 session 的 shell 命令，补全 parentCommand（引擎缓存未命中时）
  let resolvedHitl = hitl;
  if (request.kind === "shell_write_approval" && !resolvedHitl.parentCommand && sessionId) {
    for (let i = next.length - 1; i >= 0; i--) {
      const s = next[i];
      if (
        s.kind === "tool" &&
        s.name === "shell" &&
        s.sessionId === sessionId &&
        s.command?.trim()
      ) {
        resolvedHitl = { ...resolvedHitl, parentCommand: s.command.trim() };
        break;
      }
    }
  }
  const cardCommand =
    request.kind === "shell_write_approval" && resolvedHitl.parentCommand
      ? `${resolvedHitl.parentCommand} ← ${resolvedHitl.dataPreview || "…"}`
      : command;

  if (existing >= 0) {
    const prev = next[existing];
    if (prev.kind !== "tool") return next;
    const copy = [...next];
    copy[existing] = {
      ...prev,
      command: cardCommand || prev.command,
      hitl: resolvedHitl,
      phase: "start",
      active: true,
    };
    return copy;
  }

  // 挂到已有 Running 的同名工具卡，避免「Running」+「待确认」两张
  for (let i = next.length - 1; i >= 0; i--) {
    const s = next[i];
    if (s.kind === "tool" && s.name === toolName && s.phase === "start" && s.active) {
      const copy = [...next];
      copy[i] = {
        ...s,
        command: cardCommand || s.command,
        summary: cardCommand || s.summary,
        sessionId: s.sessionId || sessionId || undefined,
        hitl: resolvedHitl,
        phase: "start",
        active: true,
      };
      return copy;
    }
  }

  return [
    ...next,
    {
      id: createId("tl"),
      kind: "tool",
      name: toolName,
      command: cardCommand || undefined,
      summary: cardCommand || undefined,
      sessionId: sessionId || undefined,
      hitl: resolvedHitl,
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
  values?: Record<string, unknown>,
): ChatTimelineStep[] {
  const idx = steps.findIndex(
    (s) => s.kind === "tool" && (s.hitl?.hitlId === hitlId || s.clarify?.hitlId === hitlId),
  );
  if (idx < 0) return steps;
  const prev = steps[idx];
  if (prev.kind !== "tool") return steps;
  const denied = actionId === "deny";
  const copy = [...steps];
  if (prev.clarify && !denied) {
    copy[idx] = {
      ...prev,
      hitl: undefined,
      clarify: { ...prev.clarify, answers: parseClarifyAnswers(values) },
      phase: "end",
      active: false,
      ok: true,
    };
    return copy;
  }
  copy[idx] = {
    ...prev,
    hitl: undefined,
    phase: denied ? "end" : "start",
    active: !denied,
    ok: denied ? false : prev.ok,
  };
  return copy;
}

/** 软等待耗尽：按 sessionId 标为 still_running / backgrounded。 */
export function applyShellCommandBackgrounded(
  steps: ChatTimelineStep[],
  sessionId: string,
): ChatTimelineStep[] {
  if (!sessionId) return steps;
  const idx = steps.findIndex((s) => s.kind === "tool" && s.sessionId === sessionId);
  if (idx < 0) return steps;
  const prev = steps[idx];
  if (prev.kind !== "tool") return steps;
  const copy = [...steps];
  copy[idx] = { ...prev, backgrounded: true };
  return copy;
}

/** 命令 finalize：仍挂着的 shell 步收束为 complete（可开终端关掉）。 */
export function applyShellCommandExited(
  steps: ChatTimelineStep[],
  sessionId: string,
  exitCode: number | null,
): ChatTimelineStep[] {
  if (!sessionId) return steps;
  const idx = steps.findIndex((s) => s.kind === "tool" && s.sessionId === sessionId);
  if (idx < 0) return steps;
  const prev = steps[idx];
  if (prev.kind !== "tool") return steps;
  const copy = [...steps];
  copy[idx] = {
    ...prev,
    backgrounded: false,
    exitCode,
    phase: "end",
    active: false,
    ok: prev.ok !== false,
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
    if (s.name !== "shell" && s.name !== "shell_await" && s.name !== "shell_write") {
      continue;
    }
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

/** 追加一条 Auto 故障切换说明。 */
export function appendModelSwitch(
  steps: ChatTimelineStep[],
  event: {
    fromModelId?: string;
    fromLabel: string;
    toModelId: string;
    toLabel: string;
    reason: "auth" | "not_found" | "rate_limit" | "network" | "server" | "other";
    detail?: string;
  },
): ChatTimelineStep[] {
  return [
    ...steps,
    {
      id: createId("tl"),
      kind: "model_switch",
      fromModelId: event.fromModelId,
      fromLabel: event.fromLabel,
      toModelId: event.toModelId,
      toLabel: event.toLabel,
      reason: event.reason,
      ...(event.detail ? { detail: event.detail } : {}),
    },
  ];
}

const MAX_SUBAGENT_ENTRIES = 80;

/** 把子代理 childEvent 归并进其 childTimeline（与主会话同一套规则）。 */
function applySubagentChildEvent(
  childTimeline: ChatTimelineStep[],
  event: Extract<AgentEvent, { type: "subagent" }>,
): ChatTimelineStep[] {
  const child = event.childEvent;
  if (!child) return childTimeline;
  const base = {
    threadId: event.threadId,
    runId: event.runId,
    ts: event.ts,
  };
  if (child.type === "status") {
    return applyStatus(childTimeline, child.status);
  }
  if (child.type === "token") {
    const channel = child.channel ?? "reply";
    if (channel === "thinking") {
      return appendThinkingText(childTimeline, child.text);
    }
    return appendReplyText(childTimeline, child.text);
  }
  if (child.type === "tool") {
    return applyToolEvent(childTimeline, { ...base, ...child });
  }
  return childTimeline;
}

/** 合并子代理 Task 生命周期到时间线。 */
export function applySubagentEvent(
  steps: ChatTimelineStep[],
  event: Extract<AgentEvent, { type: "subagent" }>,
): ChatTimelineStep[] {
  const next = [...steps];
  const idx = next.findIndex((s) => s.kind === "subagent" && s.taskId === event.taskId);
  const prev =
    idx >= 0 && next[idx]?.kind === "subagent"
      ? (next[idx] as Extract<ChatTimelineStep, { kind: "subagent" }>)
      : null;
  // 已收束（含会话停止）后忽略迟到的 progress
  if (
    prev &&
    (prev.phase === "finished" || prev.phase === "failed" || prev.phase === "cancelled") &&
    (event.phase === "started" || event.phase === "progress")
  ) {
    return steps;
  }
  const active = event.phase === "started" || event.phase === "progress";
  const liveLine =
    event.phase === "progress" || event.phase === "started"
      ? (event.liveLine ?? event.summary ?? prev?.liveLine)
      : event.phase === "cancelled"
        ? undefined
        : prev?.liveLine;
  let entries = prev?.entries ? [...prev.entries] : [];
  if (event.timelineEntry) {
    entries.push(event.timelineEntry);
    if (entries.length > MAX_SUBAGENT_ENTRIES) {
      entries = entries.slice(entries.length - MAX_SUBAGENT_ENTRIES);
    }
  }
  let childTimeline = prev?.childTimeline ? [...prev.childTimeline] : [];
  if (event.childEvent) {
    childTimeline = applySubagentChildEvent(childTimeline, event);
  }
  if (event.phase === "finished" || event.phase === "failed" || event.phase === "cancelled") {
    childTimeline = deactivateAll(childTimeline);
  }
  const patch: Extract<ChatTimelineStep, { kind: "subagent" }> = {
    id: prev?.id ?? createId("tl"),
    kind: "subagent",
    taskId: event.taskId,
    subagent: event.subagent,
    // 标题只增不减：避免后续 progress 冲掉已解析的 title
    title: event.title?.trim() || prev?.title,
    phase: event.phase,
    background: event.background ?? prev?.background,
    summary:
      event.phase === "finished" || event.phase === "failed" || event.phase === "cancelled"
        ? (event.summary ?? prev?.summary)
        : prev?.summary,
    liveLine,
    entries: entries.length ? entries : undefined,
    childTimeline: childTimeline.length ? childTimeline : undefined,
    error:
      event.error ??
      (event.phase === "failed" || event.phase === "cancelled" ? event.summary : undefined),
    active,
  };
  if (idx >= 0) next[idx] = patch;
  else next.push(patch);
  return next;
}
