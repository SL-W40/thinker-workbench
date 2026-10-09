/**
 * `@thinker-workbench/markdown` 根导出：解析、流式、高亮、主题与 TOC。
 * React 视图请从 `@thinker-workbench/markdown/react` 引入。
 */
export type {
  BlockNode,
  InlineNode,
  ListItem,
  DefinitionItem,
  FootnoteDef,
  LinkDef,
  MarkdownDocument,
} from "./types";
export type { ParseOptions } from "./parse/options";
export { parseInline } from "./parse/inline";
export { parseMarkdown, parseMarkdownDocument, headingId } from "./parse/blocks";
export {
  parseFrontmatter,
  parseMetadata,
  type FrontmatterFormat,
  type FrontmatterResult,
  type MetadataFormat,
  type MetadataResult,
} from "./frontmatter";
export { extractToc, type TocItem } from "./extractToc";
export { highlightCode, registerLanguage } from "./highlight";
export {
  parseMarkdownStreaming,
  parseMarkdownSafe,
  hasOpenFence,
  type StreamingParseResult,
} from "./stream";
export {
  lightTheme,
  darkTheme,
  notesTheme,
  eyecareTheme,
  auroraTheme,
  monoTheme,
  resolveTheme,
  createTheme,
  listBuiltinThemes,
  MD_TOKEN_KEYS,
  mermaidVariablesFromCss,
  type MarkdownTheme,
  type MarkdownThemeInput,
  type MermaidThemeName,
  type MermaidLook,
  type MdTokenKey,
  type MarkdownThemeVars,
} from "./themes";
