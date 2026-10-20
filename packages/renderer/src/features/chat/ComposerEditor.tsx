/**
 * Composer 富文本输入：contenteditable + `/skill` / `@path` 芯片。
 * 对外暴露与 textarea 相近的 handle（focus / selection / caret 锚点）。
 *
 * 实现已按域拆分至 ./ComposerEditor/，本文件仅保留 barrel 以维持既有导入路径与导出面。
 */
export * from "./ComposerEditor/index";
