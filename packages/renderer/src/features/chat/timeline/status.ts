/**
 * status 行的完整生命周期：写入、增量、停用与定稿。
 */
import { type ChatTimelineStep, createId } from "@thinker-workbench/shared";
import { dropPlanning, dropTrailingEphemeralThoughts } from "./planning";

export type FinalizeOpts = {
  /**
   * 为 true（默认）时，缺 durationMs 可用 startedAt 按当前墙钟结算（仅实时收束）。
   * hydrate / 读历史必须为 false，否则每次刷新都会把「已思考」拉长。
   */
  wallClock?: boolean;
};

/** 结束一条仍在活动的 status；thinking 带上 durationMs，并清掉 startedAt 防重算。 */
export function finalizeStatusStep(
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
export function finalizeActiveSubagent(
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
