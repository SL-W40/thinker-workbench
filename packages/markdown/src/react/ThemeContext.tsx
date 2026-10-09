/**
 * Markdown 主题 React 上下文；供 CodeBlock / MermaidDiagram 读取当前主题。
 */
import { createContext, useContext, type ReactNode } from "react";
import { lightTheme } from "../themes/light";
import type { MarkdownTheme } from "../themes/types";

const ThemeContext = createContext<MarkdownTheme>(lightTheme);

type Props = {
  /** 当前 markdown 主题。 */
  theme: MarkdownTheme;
  children: ReactNode;
};

export function MarkdownThemeProvider({ theme, children }: Props) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** 读取当前 markdown 主题（默认 light）。 */
export function useMarkdownTheme(): MarkdownTheme {
  return useContext(ThemeContext);
}
