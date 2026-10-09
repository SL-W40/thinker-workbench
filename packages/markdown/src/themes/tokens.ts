/**
 * `@thinker-workbench/markdown/styles.less` 消费的 CSS 自定义属性名。
 * 通过 `MarkdownTheme.vars`（写在 `.tw-md` 上）或宿主 CSS 注入。
 */
export const MD_TOKEN_KEYS = [
  "--md-fg",
  "--md-fg-muted",
  "--md-bg",
  "--md-accent",
  "--md-border",
  "--md-panel",
  "--md-code-bg",
  "--md-code-fg",
  "--md-pre-bg",
  "--md-pre-fg",
  "--md-blockquote-bg",
  "--md-table-head",
  "--md-danger",
  "--md-danger-bg",
  "--md-shadow-soft",
  "--md-stream-glow",
  "--md-font-mono",
  "--md-font-hand",
  "--md-hl-keyword",
  "--md-hl-string",
  "--md-hl-number",
  "--md-hl-comment",
  "--md-hl-title",
  "--md-hl-attr",
  "--md-hl-built-in",
  "--md-hl-literal",
  "--md-hl-type",
  "--md-hl-meta",
  "--md-mermaid-dark",
  "--md-mermaid-paper",
  "--md-mermaid-rule",
  "--md-mermaid-margin",
  "--md-mermaid-glow",
  "--md-mermaid-font-size",
  "--md-mermaid-primary",
  "--md-mermaid-primary-text",
  "--md-mermaid-primary-border",
  "--md-mermaid-secondary",
  "--md-mermaid-secondary-text",
  "--md-mermaid-secondary-border",
  "--md-mermaid-tertiary",
  "--md-mermaid-tertiary-text",
  "--md-mermaid-tertiary-border",
  "--md-mermaid-line",
  "--md-mermaid-text",
  "--md-mermaid-cluster",
  "--md-mermaid-cluster-border",
  "--md-mermaid-note",
  "--md-mermaid-note-border",
  "--md-mermaid-activation",
  "--md-mermaid-actor-line",
] as const;

export type MdTokenKey = (typeof MD_TOKEN_KEYS)[number];
export type MarkdownThemeVars = Partial<Record<MdTokenKey, string>> & Record<string, string>;

/** 把 CSS token 映射为 mermaid `themeVariables`（从 `.tw-md` 计算样式读取）。 */
export function mermaidVariablesFromCss(host: Element): Record<string, string> {
  const s = getComputedStyle(host);
  const v = (key: MdTokenKey) => s.getPropertyValue(key).trim();

  const paper = v("--md-mermaid-paper");
  const primary = v("--md-mermaid-primary");
  const primaryText = v("--md-mermaid-primary-text");
  const primaryBorder = v("--md-mermaid-primary-border");
  const secondary = v("--md-mermaid-secondary");
  const secondaryText = v("--md-mermaid-secondary-text");
  const secondaryBorder = v("--md-mermaid-secondary-border");
  const tertiary = v("--md-mermaid-tertiary");
  const tertiaryText = v("--md-mermaid-tertiary-text");
  const tertiaryBorder = v("--md-mermaid-tertiary-border");
  const line = v("--md-mermaid-line");
  const text = v("--md-mermaid-text");
  const cluster = v("--md-mermaid-cluster");
  const clusterBorder = v("--md-mermaid-cluster-border");
  const note = v("--md-mermaid-note");
  const noteBorder = v("--md-mermaid-note-border");
  const activation = v("--md-mermaid-activation");
  const actorLine = v("--md-mermaid-actor-line");
  const fontHand = v("--md-font-hand");
  const fontSize = v("--md-mermaid-font-size") || "16px";
  const darkMode = v("--md-mermaid-dark") || "false";

  return {
    darkMode,
    background: paper,
    fontFamily: fontHand,
    fontSize,
    primaryColor: primary,
    primaryTextColor: primaryText,
    primaryBorderColor: primaryBorder,
    secondaryColor: secondary,
    secondaryTextColor: secondaryText,
    secondaryBorderColor: secondaryBorder,
    tertiaryColor: tertiary,
    tertiaryTextColor: tertiaryText,
    tertiaryBorderColor: tertiaryBorder,
    lineColor: line,
    textColor: text,
    mainBkg: primary,
    nodeBorder: primaryBorder,
    clusterBkg: cluster,
    clusterBorder,
    titleColor: text,
    edgeLabelBackground: paper,
    actorBkg: primary,
    actorBorder: primaryBorder,
    actorTextColor: primaryText,
    actorLineColor: actorLine || line,
    signalColor: text,
    signalTextColor: text,
    labelBoxBkgColor: secondary || paper,
    labelBoxBorderColor: clusterBorder,
    labelTextColor: text,
    loopTextColor: text,
    noteBkgColor: note,
    noteTextColor: text,
    noteBorderColor: noteBorder,
    activationBkgColor: activation,
    activationBorderColor: primaryBorder,
    sequenceNumberColor: paper,
  };
}
