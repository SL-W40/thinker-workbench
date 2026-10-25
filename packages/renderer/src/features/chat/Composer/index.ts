/**
 * composer 领域对外出口：输入区编排壳、编辑器、附件预览与供其它领域复用的 mention 工具。
 * 领域内部相互引用走直接路径（如 ./composerMentions），不经本 barrel，避免同目录绕圈。
 */
export { Composer } from "./Composer";
export { ComposerEditor, type ComposerEditorHandle } from "./ComposerEditor";
export { chatSubmitBlocked } from "./chatSubmit";
export { extractAttachmentIds, extractContextPaths } from "./composerMentions";
export { serializeComposerEditor } from "./dom";
export { SendGlyph, StopGlyph } from "./glyphs";
export { MentionChipPreview } from "./MentionChipPreview";
export { MentionsRichText } from "./MentionsRichText";
