/**
 * chat 功能对外出口：外部一律从这里取，不得再深引内部领域路径。
 *
 * 之所以显式列举而不是 `export *`：
 * - 避免把内部工具（常量、私有换算）泄漏成公共 API；
 * - 领域目录里存在同名/近名导出时（RunTimeline / Composer / ChatUsageBar）不会互相冲突；
 * - 领域内部再拆分重组（例如 timelineModel 拆成多个模块）时，外部 import 不变。
 */
// 输入区

export { SubagentSessionView } from "./cards/SubagentSessionView";
export { subagentDisplayTitle } from "./cards/subagentTitle";
// 卡片
export { TodoList } from "./cards/TodoList";
export { Composer } from "./composer/Composer";
export { ComposerEditor, type ComposerEditorHandle } from "./composer/ComposerEditor";
export { chatSubmitBlocked } from "./composer/chatSubmit";
export { extractAttachmentIds } from "./composer/composerMentions";
export { SendGlyph, StopGlyph } from "./composer/glyphs";
export { MentionChipPreview } from "./composer/MentionChipPreview";
export { MentionsRichText } from "./composer/MentionsRichText";
// 消息
export { ChatImageStrip } from "./message/ChatImageStrip";
export { visibleAssistantText } from "./message/messageModel";
export { ChatSidePanel } from "./panels/ChatSidePanel";
// 面板与布局
export { ChatStage } from "./panels/ChatStage";
export { SessionTodoBar } from "./panels/SessionTodoBar";
export { useStickToBottomScroll } from "./panels/useStickToBottomScroll";
export { WorkspaceSidebar } from "./panels/WorkspaceSidebar";
// 顶部选择器
export { ModelPicker } from "./pickers/ModelPicker";
export { ModePicker } from "./pickers/ModePicker";
// 会话编排
export { useChatPanels } from "./session/useChatPanels";
export { useChatSession } from "./session/useChatSession";
// 跨领域工具
export { isUnlockDeniedError } from "./shared/systemErrors";
export { isTimelineHitlKind, reconcileTimelineReply, stripTimelineEcho } from "./timeline";
// 时间线
export { RunTimeline } from "./timeline/RunTimeline";
// 用量
export { ChatUsageBar } from "./usage/ChatUsageBar";
