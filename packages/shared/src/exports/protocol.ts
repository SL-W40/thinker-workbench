// 由 shared/src/index.ts 拆分而来：导出面与拆分前完全一致。

export type {
  AttachmentKind,
  ChatAttachmentRef,
  ChatImageRef,
  ChatMessage,
  ChatPlan,
  ChatTimelineErrorStep,
  ChatTimelineModelSwitchStep,
  ChatTimelineResultPathKind,
  ChatTimelineStatusStep,
  ChatTimelineStep,
  ChatTimelineSubagentStep,
  ChatTimelineTextStep,
  ChatTimelineToolStep,
  ChatTimelineTransitionStep,
  Role,
} from "../protocol/message";
export { activePlanOf, isPlanStatus } from "../protocol/plan";
export type { RunResult } from "../protocol/result";
export type { ChatTimelineTodoHint, ChatTodo, ChatTodoAction } from "../protocol/todo";
export {
  isTodoAction,
  isTodoReadAction,
  mergeTodos,
  normalizeTodos,
  TODO_ACTIONS,
  todoProgress,
  unfinishedTodos,
} from "../protocol/todo";
export {
  addUsage,
  EMPTY_USAGE,
  hasUsage,
  sanitizeUsage,
  totalTokens,
} from "../protocol/usage";
