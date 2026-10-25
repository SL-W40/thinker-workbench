/**
 * create_plan 参数流式：模型边吐 tool_call.arguments，边把能解析出的字段
 * 以 `plan/drafting` 事件推给 UI，让时间线卡片随生成逐步成形，
 * 而不是等整次调用结束才「啪」地出现一张完整卡片。
 *
 * 只认 `create_plan` 这一次调用，且按 index 归并（并行多次调用互不干扰）；
 * 事件按时间节流，避免每几个字符就刷新一次 UI。
 */
import type { ChatToolCallDelta } from "../model/types";
import { emitPlan } from "../runtime/emitHelpers";
import type { RunEmitter } from "../runtime/runEmit";
import { readPartialPlanArgs } from "../tools/create_plan/partial";
import { planIdForSession } from "./planId";

/** 默认节流间隔（毫秒）：与 UI 观感对齐，约每 60ms 一帧。 */
const DEFAULT_INTERVAL_MS = 60;

type Deps = {
  emit: RunEmitter | null;
  sessionId?: string;
  /** 节流间隔；单测里可设 0 关掉节流。 */
  intervalMs?: number;
  now?: () => number;
};

export type PlanDraftStream = {
  /** 挂到 ChatRequest.onToolCallDelta。 */
  onToolCallDelta: (delta: ChatToolCallDelta) => void;
};

/**
 * 建一个 draft 流；一次模型回合用一个（回合结束即丢弃）。
 * emit 为空时退化为纯累积，不产生任何事件。
 */
export function createPlanDraftStream(deps: Deps): PlanDraftStream {
  const interval = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const now = deps.now ?? Date.now;
  // -Infinity：首个可读片段必须立刻发出，之后才按间隔节流
  let lastAt = Number.NEGATIVE_INFINITY;
  const accs = new Map<number, { id?: string; name: string; args: string }>();

  return {
    onToolCallDelta: (delta) => {
      const acc = accs.get(delta.index) ?? { id: undefined, name: "", args: "" };
      // name 传的是拼接后的当前值：整体覆盖，避免重复追加
      if (delta.name) acc.name = delta.name;
      if (delta.id) acc.id = delta.id;
      acc.args += delta.argsChunk;
      accs.set(delta.index, acc);

      if (acc.name !== "create_plan") return;
      const fields = readPartialPlanArgs(acc.args);
      // 还没有可读的标题 / 描述 / 待办时不发，避免先出现一张空卡
      if (!fields.title && !fields.description && fields.todos.length === 0) return;

      const ts = now();
      if (ts - lastAt < interval) return;
      lastAt = ts;

      emitPlan(deps.emit, {
        phase: "drafting",
        planId: planIdForSession(deps.sessionId),
        ...(acc.id ? { callId: acc.id } : {}),
        ...(fields.title ? { title: fields.title } : {}),
        ...(fields.description ? { description: fields.description } : {}),
        status: fields.status,
        todos: fields.todos,
      });
    },
  };
}
