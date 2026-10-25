/**
 * 错误步与模型切换：把运行期异常与中途切模型落成时间线节点。
 */
import { type ChatTimelineStep, createId } from "@thinker-workbench/shared";
import { deactivateAll } from "./status";

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
