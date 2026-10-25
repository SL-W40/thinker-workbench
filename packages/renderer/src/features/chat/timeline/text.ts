/**
 * 正文与思考流的增量追加：并入现有尾部 step，避免每一步都新建节点。
 */
import { type ChatTimelineStep, createId } from "@thinker-workbench/shared";
import { TRANSITION_MARKER_MAX } from "./constants";
import { dropTrailingEphemeralThoughts } from "./planning";
import { truncatePhrase } from "./reconcile";
import { applyStatus, deactivateStatuses, finalizeStatusStep } from "./status";
import { extractTransitionLine } from "./transition";

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
