/**
 * 主题解析、合成与 CSS 变量落盘。
 * `applyDesignTheme` 把 UI + markdown token 写到宿主元素。
 */
import { type MarkdownTheme, SANS_STACK } from "@thinker-workbench/markdown";
import { LEGACY_UI_ALIASES, type UiTokenKey } from "../tokens/keys";
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

/**
 * 次级 token 的缺省派生规则：主题未显式提供时按「前景色 N% 叠加」生成。
 *
 * 这些 token 此前从未被写入过，Less 里只能退到 `var(--x, 兜底)` 的兜底值，
 * 导致同一处样式在深浅主题下表现不一致。统一派生后天然随主题翻转，
 * 也不必为每个内置主题手填一整套色值。
 */
const DERIVED_FROM_FG: Record<string, number> = {
  "--tw-bg-subtle": 4,
  "--tw-bg-muted": 7,
  "--tw-surface-2": 9,
  "--tw-surface-hover": 6,
  "--tw-border-subtle": 12,
};

/** 直接引用其它 token 的次级 token。 */
const DERIVED_ALIAS: Record<string, UiTokenKey> = {
  "--tw-panel-solid": "--tw-bg-elev",
};

/** 成功色缺省值：按明暗各给一个，保证对比度。 */
const SUCCESS_BY_SCHEME: Record<string, string> = {
  light: "#2f8a4e",
  dark: "#3fb950",
};

/**
 * 在应用阶段才产生的 token——主题表里不需要、也不该有对应值。
 * 校验「每个主题是否提供了全部 token」时必须排除这批。
 */
export const APPLIED_STAGE_TOKENS: readonly string[] = [
  "--tw-font-ui",
  ...Object.keys(DERIVED_FROM_FG),
  ...Object.keys(DERIVED_ALIAS),
  "--tw-success",
];

/** 写入派生 token；主题已显式提供的不覆盖。 */
function applyDerivedTokens(el: HTMLElement, ui: Record<string, string>, dark: boolean): void {
  const fg = ui["--tw-fg"] || "#111111";
  for (const [key, percent] of Object.entries(DERIVED_FROM_FG)) {
    if (typeof ui[key] === "string") continue;
    el.style.setProperty(key, `color-mix(in srgb, ${fg} ${percent}%, transparent)`);
  }
  for (const [key, source] of Object.entries(DERIVED_ALIAS)) {
    if (typeof ui[key] === "string") continue;
    const value = ui[source];
    if (typeof value === "string") el.style.setProperty(key, value);
  }
  if (typeof ui["--tw-success"] !== "string") {
    el.style.setProperty("--tw-success", dark ? SUCCESS_BY_SCHEME.dark : SUCCESS_BY_SCHEME.light);
  }
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
    resolved.colorScheme ?? (resolved.id === "dark" || resolved.id === "aurora" ? "dark" : "light");

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

  // 次级 token（弱化表面 / 弱化边框 / 成功色）由前景色派生，主题可显式覆盖
  applyDerivedTokens(el, resolved.ui, el.style.colorScheme === "dark");

  // UI / markdown 正文字体与 body 对齐，并写入 `--font` / `--display` 等遗留别名。
  const body = resolved.ui["--tw-font-body"] || SANS_STACK;
  el.style.setProperty("--tw-font-ui", body);
  el.style.setProperty("--md-font", body);
  el.style.setProperty("--font", body);
  el.style.setProperty("--display", body);

  // 文档 iframe 等仍读取 `--paper` 的表面。
  const bg = resolved.ui["--tw-bg"];
  if (typeof bg === "string") el.style.setProperty("--paper", bg);

  return resolved;
}
