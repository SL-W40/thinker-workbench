/**
 * 设计主题 React 宿主：挂载时 apply CSS 变量，并提供 `useDesignTheme`。
 * 同时挂载 `TitleTooltipHost`，用主题化浮层替代原生 `title`。
 */

import type { MarkdownTheme } from "@thinker-workbench/markdown";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TitleTooltipHost } from "../components/TitleTooltipHost/TitleTooltipHost";
import {
  applyDesignTheme,
  createDesignTheme,
  type DesignTheme,
  type DesignThemeInput,
  lightTheme,
  resolveDesignTheme,
  toMarkdownTheme,
} from "../themes";

type ThemeContextValue = {
  /** 当前完整设计主题。 */
  theme: DesignTheme;
  /** 当前主题 id。 */
  themeId: string;
  /** 供 `MarkdownView theme={markdownTheme}` 使用的 markdown 切片。 */
  markdownTheme: MarkdownTheme;
  /** 切换主题（id 或对象）。 */
  setTheme: (next: DesignThemeInput) => void;
  /** 在当前主题上打补丁（自定义）。 */
  customize: (overrides: Parameters<typeof createDesignTheme>[1]) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type Props = {
  children: ReactNode;
  /** 初始主题 id 或对象（挂载后非受控）。 */
  theme?: DesignThemeInput;
  /** 写入 CSS 变量的目标元素。默认 `document.documentElement`。 */
  target?: HTMLElement | null;
};

export function ThemeProvider({ children, theme: themeInput = "light", target }: Props) {
  const [theme, setThemeState] = useState<DesignTheme>(() => resolveDesignTheme(themeInput));

  useEffect(() => {
    applyDesignTheme(theme, { target: target ?? undefined });
  }, [theme, target]);

  const setTheme = useCallback((next: DesignThemeInput) => {
    const resolved = resolveDesignTheme(next);
    // 始终克隆，便于同 id 主题覆盖 token 时 React 仍会应用 CSS。
    setThemeState({
      ...resolved,
      ui: { ...resolved.ui },
      markdown: { ...resolved.markdown },
      mermaid: {
        theme: resolved.mermaid.theme,
        look: resolved.mermaid.look,
        themeVariables: { ...resolved.mermaid.themeVariables },
      },
    });
  }, []);

  const customize = useCallback((overrides: Parameters<typeof createDesignTheme>[1]) => {
    setThemeState((prev) => createDesignTheme(prev, overrides));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themeId: theme.id,
      markdownTheme: toMarkdownTheme(theme),
      setTheme,
      customize,
    }),
    [theme, setTheme, customize],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      <TitleTooltipHost />
    </ThemeContext.Provider>
  );
}

/** 读取当前设计主题上下文；在 Provider 外回退到 light 空操作。 */
export function useDesignTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    const theme = lightTheme;
    return {
      theme,
      themeId: theme.id,
      markdownTheme: toMarkdownTheme(theme),
      setTheme: () => undefined,
      customize: () => undefined,
    };
  }
  return ctx;
}
