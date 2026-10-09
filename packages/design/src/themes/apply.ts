/**
 * 主题解析、合成与 CSS 变量落盘。
 * `applyDesignTheme` 把 UI + markdown token 写到宿主元素。
 */
import type { MarkdownTheme } from "@thinker-workbench/markdown";
import { LEGACY_UI_ALIASES } from "../tokens/keys";
import { auroraTheme } from "./aurora";
import { darkTheme } from "./dark";
import { eyecareTheme } from "./eyecare";
import { lightTheme } from "./light";
import { notesTheme } from "./notes";
import type { DesignTheme, DesignThemeInput } from "./types";

const builtins: Record<string, DesignTheme> = {
  light: lightTheme,
  dark: darkTheme,
  notes: notesTheme,
  eyecare: eyecareTheme,
  aurora: auroraTheme,
  dusk: auroraTheme,
  mono: lightTheme,
};

/** 把 id 或主题对象解析为完整 `DesignTheme`（缺省回退 notes）。 */
export function resolveDesignTheme(input?: DesignThemeInput | null): DesignTheme {
  if (!input) return notesTheme;
  if (typeof input === "string") {
    if (input === "system") return lightTheme;
    return builtins[input] ?? notesTheme;
  }
  const base = builtins[input.id] ?? notesTheme;
  return {
    ...base,
    ...input,
    colorScheme: input.colorScheme ?? base.colorScheme,
    typeStyle: input.typeStyle ?? base.typeStyle,
    ui: { ...base.ui, ...input.ui },
    markdown: { ...base.markdown, ...input.markdown },
    mermaid: {
      theme: input.mermaid?.theme ?? base.mermaid.theme,
      look: input.mermaid?.look ?? base.mermaid.look,
      themeVariables: {
        ...base.mermaid.themeVariables,
        ...input.mermaid?.themeVariables,
      },
    },
  };
}

/** 列出内置设计主题（色板；不含 `system` 偏好）。 */
export function listDesignThemes(): DesignTheme[] {
  return [lightTheme, darkTheme, notesTheme, eyecareTheme, auroraTheme];
}

/** 从设计主题切出 markdown 渲染器所需的主题形态。 */
export function toMarkdownTheme(theme: DesignThemeInput): MarkdownTheme {
  const resolved = resolveDesignTheme(theme);
  return {
    id: resolved.id,
    vars: { ...resolved.markdown },
    mermaid: { ...resolved.mermaid },
  };
}

/** 在基础设计主题上合并覆盖（自定义主题）。 */
export function createDesignTheme(
  base: DesignThemeInput,
  overrides: Partial<DesignTheme> & {
    ui?: Record<string, string>;
    markdown?: Record<string, string>;
  },
): DesignTheme {
  const resolved = resolveDesignTheme(base);
  return {
    id: overrides.id ?? resolved.id,
    colorScheme: overrides.colorScheme ?? resolved.colorScheme,
    typeStyle: overrides.typeStyle ?? resolved.typeStyle,
    ui: { ...resolved.ui, ...overrides.ui },
    markdown: { ...resolved.markdown, ...overrides.markdown },
    mermaid: {
      theme: overrides.mermaid?.theme ?? resolved.mermaid.theme,
      look: overrides.mermaid?.look ?? resolved.mermaid.look,
      themeVariables: {
        ...resolved.mermaid.themeVariables,
        ...overrides.mermaid?.themeVariables,
      },
    },
  };
}

export type ApplyThemeOptions = {
  /** 默认 `document.documentElement`。 */
  target?: HTMLElement | null;
  /** 是否同时写入 `--ink` / `--bg` 等遗留笔记 Less 别名。默认 true。 */
  legacyAliases?: boolean;
};

/** 把 UI + markdown CSS 变量写到宿主元素。 */
export function applyDesignTheme(
  theme: DesignThemeInput,
  options: ApplyThemeOptions = {},
): DesignTheme {
  const resolved = resolveDesignTheme(theme);
  const el = options.target ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return resolved;

  el.dataset.twTheme = resolved.id;
  el.style.colorScheme =
    resolved.colorScheme ??
    (resolved.id === "dark" || resolved.id === "aurora" ? "dark" : "light");

  for (const [key, value] of Object.entries(resolved.ui)) {
    if (typeof value === "string") el.style.setProperty(key, value);
  }
  for (const [key, value] of Object.entries(resolved.markdown)) {
    if (typeof value === "string") el.style.setProperty(key, value);
  }

  if (options.legacyAliases !== false) {
    for (const [alias, source] of Object.entries(LEGACY_UI_ALIASES)) {
      const value = resolved.ui[source];
      if (typeof value === "string") el.style.setProperty(alias, value);
    }
  }

  const typeStyle = resolved.typeStyle ?? "regular";
  el.dataset.twType = typeStyle;
  if (typeStyle === "regular") {
    const body =
      resolved.ui["--tw-font-body"] ||
      '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';
    el.style.setProperty("--tw-font-hand", body);
    el.style.setProperty("--tw-font-ui", body);
    el.style.setProperty("--md-font-hand", body);
    el.style.setProperty("--font-hand", body);
    el.style.setProperty("--font", body);
    el.style.setProperty("--display", body);
  } else {
    const ui =
      resolved.ui["--tw-font-ui"] ||
      resolved.ui["--tw-font-hand"] ||
      '"Segoe Print", "Bradley Hand", "Apple Chancery", "TW Hand", cursive';
    el.style.setProperty("--tw-font-ui", ui);
    el.style.setProperty("--font", ui);
  }

  // 文档 iframe 等仍读取 `--paper` 的表面。
  const bg = resolved.ui["--tw-bg"];
  if (typeof bg === "string") el.style.setProperty("--paper", bg);

  return resolved;
}
