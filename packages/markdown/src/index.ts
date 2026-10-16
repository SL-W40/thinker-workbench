/**
 * `@thinker-workbench/markdown` 根导出：解析、流式、高亮、主题与 TOC。
 * React 视图请从 `@thinker-workbench/markdown/react` 引入。
 */

export { extractToc, type TocItem } from "./extractToc";
export { type FrontmatterFormat, type FrontmatterResult, parseFrontmatter } from "./frontmatter";
export { highlightCode, registerLanguage } from "./highlight";
export { looksRenderable as mermaidLooksRenderable } from "./mermaid/looksRenderable";
export { ensureSvgXmlns } from "./mermaid/svgExport";
export { headingId, parseMarkdown, parseMarkdownDocument } from "./parse/blocks";
export { parseInline } from "./parse/inline";
export type { ParseOptions } from "./parse/options";
export {
  hasOpenFence,
  parseMarkdownSafe,
  parseMarkdownStreaming,
  type StreamingParseResult,
} from "./stream";
export {
  inlineToPlainText,
  type TableAlign,
  tableToCsv,
  tableToMarkdown,
  tableToMatrix,
  tableToTsv,
} from "./table/serialize";
export {
  auroraTheme,
  createTheme,
  darkTheme,
  eyecareTheme,
  lightTheme,
  listBuiltinThemes,
  type MarkdownTheme,
  type MarkdownThemeInput,
  type MarkdownThemeVars,
  MD_TOKEN_KEYS,
  type MdTokenKey,
  type MermaidLook,
  type MermaidThemeName,
  mermaidVariablesFromCss,
  monoTheme,
  notesTheme,
  resolveTheme,
} from "./themes";
export type {
  AlertKind,
  BlockNode,
  DefinitionItem,
  FootnoteDef,
  InlineNode,
  LinkDef,
  ListItem,
  MarkdownDocument,
} from "./types";
