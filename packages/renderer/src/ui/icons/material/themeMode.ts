/**
 * 图标的明暗模式：material 清单里暗底用默认图标，亮底用 `_light` 变体。
 *
 * 有两条读取链路：
 * - React 链路走设计主题上下文（`useIconMode`），切主题会重渲染；
 * - DOM 链路（composer 里手工拼的 mention 芯片）用不了 hook，只能同步读 DOM 上的主题标记（`domIconMode`）。
 */
import { useDesignTheme } from "@thinker-workbench/design/react";

export type IconThemeMode = "dark" | "light";

/** 内置深色主题 id（自定义主题以 `colorScheme` 为准，这里只兜住没写 colorScheme 的情况）。 */
const DARK_THEME_IDS = new Set(["dark", "aurora"]);

/** DOM 链路：优先读 `applyDesignTheme` 写到根元素上的 colorScheme，读不到再按主题 id 猜。 */
export function domIconMode(): IconThemeMode {
  if (typeof document === "undefined") return "light";
  const el = document.documentElement;
  const scheme = el.style.colorScheme;
  if (scheme === "dark" || scheme === "light") return scheme;
  return DARK_THEME_IDS.has(el.dataset.twTheme ?? "") ? "dark" : "light";
}

/** React 链路：跟随设计主题上下文，切换主题时整棵树重渲染。 */
export function useIconMode(): IconThemeMode {
  const { theme } = useDesignTheme();
  const scheme = theme.colorScheme ?? (DARK_THEME_IDS.has(theme.id) ? "dark" : "light");
  return scheme === "dark" ? "dark" : "light";
}
