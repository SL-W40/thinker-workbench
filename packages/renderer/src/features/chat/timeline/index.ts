/**
 * timeline 领域对外出口：时间线组件 + 时间线换算。
 *
 * 时间线换算原先集中在单文件 `timelineModel.ts`（约 1400 行），现按事件类型拆成若干模块：
 * - `constants`：跨模块共用的阈值与标记
 * - `queuedWait` / `reconcile` / `planning` / `transition`：结构性处理
 * - `status` / `text` / `tools` / `planDraft` / `shell` / `hitl` / `subagent` / `errors`：各类事件的时间线写入
 * - `history` / `deleteRestore`：会话切换时的取舍与过期清理
 *
 * 本文件只做再导出：外部仍从这里取名字，内部模块之间禁止经本文件互相引用，保证依赖单向无环。
 */

// 跨模块共用的阈值与标记
export {
  QUEUED_WAIT_STEP_ID,
  TRANSITION_MARKER,
  TRANSITION_MARKER_MAX,
  TRANSITION_TEXT_MAX,
} from "./constants";
export {
  isDeleteRestoreExpired,
  pruneExpiredDeleteRestoreCaches,
  readDeleteFileRestoreTtlDays,
} from "./deleteRestore";
export { appendError, appendModelSwitch } from "./errors";
// 历史取舍与恢复缓存清理
export { freezeTimelineHistory, pickRicherTimeline } from "./history";
export { applyHitlRequest, applyHitlResolved, isTimelineHitlKind } from "./hitl";
export { applyPlanDraftStep } from "./planDraft";
// 排队等待槽
export { applyQueuedSlotEvent, stripQueuedWait, withQueuedWait } from "./queuedWait";
export { RunTimeline } from "./RunTimeline";
// 答复去重与对齐
export { reconcileTimelineReply, stripTimelineEcho } from "./reconcile";
export {
  appendShellLiveOutput,
  applyShellCommandBackgrounded,
  applyShellCommandExited,
  bindShellSessionId,
} from "./shell";
// status 行生命周期
export { applyStatus, deactivateAll, deactivateStatuses } from "./status";
export { applySubagentEvent } from "./subagent";
// 正文与思考流
export { appendReplyText, appendThinkingText } from "./text";
// 各类事件
export { applyToolEvent } from "./tools";
// 承上启下小结
export {
  extractTransitionLine,
  isTransitionTextStep,
  stripTransitionLines,
} from "./transition";
