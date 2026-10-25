/**
 * 块级解析器出口。
 *
 * 实现原先集中在这一个 979 行的文件里；现已按块类型拆到同级 `blocks/` 目录——
 * `common`（缩进 / 围栏 / 锚点等原语）、`heading`、`table`、`list`、`blockquote`、
 * `definitions`（链接定义与脚注）、`definitionList`、`blockStart`、`codeBlock`，
 * 主循环与对外入口在 `blocks/parseBlocks`。
 *
 * 需要递归的实现（列表项、引用体、定义内容）由主循环以 `parseNested` 回调注入
 * 二次解析入口，因此依赖方向始终是「主循环 → 子模块」，不存在循环依赖。
 * 保留本文件是为了不打乱 `parse/blocks` 这一既有导入路径。
 */
export { type FragmentParser, headingId } from "./blocks/common";
export { parseMarkdown, parseMarkdownDocument } from "./blocks/parseBlocks";
