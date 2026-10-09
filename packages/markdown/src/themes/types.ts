/**
 * Markdown 主题类型：CSS 变量 + Mermaid 配置。
 */
import type { MarkdownThemeVars } from "./tokens";

export type MermaidThemeName = "default" | "dark" | "forest" | "neutral" | "base";

export type MermaidLook = "classic" | "handDrawn" | "neo";

export type MarkdownTheme = {
  /** 稳定 id，用作 data-theme / class 后缀。 */
  id: string;
  /** 应用到 markdown 根节点的 CSS 自定义属性（主题注入面）。 */
  vars: MarkdownThemeVars;
  mermaid: {
    theme: MermaidThemeName;
    /** Mermaid 11 草图风格；默认 `handDrawn`。 */
    look?: MermaidLook;
    /** 叠在由 CSS token 推导的 mermaid 变量之上的可选覆盖。 */
    themeVariables?: Record<string, string>;
  };
};

export type MarkdownThemeInput = MarkdownTheme | string;
