/**
 * 将设置中的主题偏好解析为可应用的 DesignTheme（含自定义目录）。
 */
import { resolveDesignTheme } from "./apply";
import type { DesignTheme } from "./types";

/** 与 shared CustomThemeRecord 同形（design 不依赖 shared）。 */
export type CustomThemeLike = {
  id: string;
  theme: {
    id: string;
    colorScheme?: "light" | "dark";
    typeStyle?: "hand" | "regular";
    ui: Record<string, string>;
    markdown: Record<string, string>;
    mermaid?: {
      theme?: string;
      look?: string;
      themeVariables?: Record<string, string>;
    };
  };
};

const MERMAID_THEMES = new Set(["default", "dark", "forest", "neutral", "base"]);
const MERMAID_LOOKS = new Set(["classic", "handDrawn", "neo"]);

/** 深拷贝自定义快照为 DesignTheme。 */
function themeFromCustom(record: CustomThemeLike): DesignTheme {
  const t = record.theme;
  const rawTheme = t.mermaid?.theme;
  const rawLook = t.mermaid?.look;
  return {
    id: record.id,
    colorScheme: t.colorScheme,
    typeStyle: t.typeStyle,
    ui: { ...t.ui },
    markdown: { ...t.markdown },
    mermaid: {
      theme:
        typeof rawTheme === "string" && MERMAID_THEMES.has(rawTheme)
          ? (rawTheme as DesignTheme["mermaid"]["theme"])
          : "neutral",
      look:
        typeof rawLook === "string" && MERMAID_LOOKS.has(rawLook)
          ? (rawLook as NonNullable<DesignTheme["mermaid"]["look"]>)
          : "classic",
      themeVariables: { ...t.mermaid?.themeVariables },
    },
  };
}

/**
 * 解析 UI 主题偏好。
 * - `system` → light/dark 内置
 * - 内置 id → resolveDesignTheme
 * - 自定义目录命中 → 快照深拷贝
 * - 未命中 → light
 */
export function resolveUiTheme(
  themeId: string,
  customs: readonly CustomThemeLike[] = [],
  prefersDark = false,
): DesignTheme {
  if (themeId === "system") {
    return resolveDesignTheme(prefersDark ? "dark" : "light");
  }
  const custom = customs.find((c) => c.id === themeId);
  if (custom) return themeFromCustom(custom);
  return resolveDesignTheme(themeId);
}

/** 取主题窗口底色（`--tw-bg`）。 */
export function windowBgFromTheme(theme: DesignTheme): string {
  const bg = theme.ui["--tw-bg"];
  return typeof bg === "string" && bg.trim() ? bg.trim() : "#ffffff";
}
