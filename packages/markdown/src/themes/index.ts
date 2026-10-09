/**
 * 仅 Markdown 的主题切片。宿主应用宜优先使用 `@thinker-workbench/design`
 * 的 `DesignTheme` + `toMarkdownTheme()`，使 UI 与 markdown 共用同一色板。
 */
import { auroraTheme } from "./aurora";
import { darkTheme } from "./dark";
import { eyecareTheme } from "./eyecare";
import { lightTheme } from "./light";
import { notesTheme } from "./notes";
import { monoTheme } from "./mono";
import type { MarkdownTheme, MarkdownThemeInput } from "./types";

export type {
  MarkdownTheme,
  MarkdownThemeInput,
  MermaidThemeName,
  MermaidLook,
} from "./types";
export {
  MD_TOKEN_KEYS,
  mermaidVariablesFromCss,
  type MdTokenKey,
  type MarkdownThemeVars,
} from "./tokens";
export { lightTheme, darkTheme, notesTheme, eyecareTheme, auroraTheme, monoTheme };

const builtins: Record<string, MarkdownTheme> = {
  light: lightTheme,
  dark: darkTheme,
  notes: notesTheme,
  eyecare: eyecareTheme,
  aurora: auroraTheme,
  mono: monoTheme,
  dusk: auroraTheme,
};

/** 解析主题 id 或对象。未知 id 回退到 notes。 */
export function resolveTheme(input?: MarkdownThemeInput | null): MarkdownTheme {
  if (!input) return notesTheme;
  if (typeof input === "string") return builtins[input] ?? notesTheme;
  return {
    ...input,
    vars: { ...notesTheme.vars, ...input.vars },
    mermaid: { ...notesTheme.mermaid, ...input.mermaid },
  };
}

/** 列出内置 markdown 主题（不含已弃用别名）。 */
export function listBuiltinThemes(): MarkdownTheme[] {
  return [lightTheme, darkTheme, notesTheme, eyecareTheme, auroraTheme];
}

/** 在基础主题上合并调用方覆盖。 */
export function createTheme(
  base: MarkdownThemeInput,
  overrides: Partial<MarkdownTheme> & { vars?: Record<string, string> },
): MarkdownTheme {
  const resolved = resolveTheme(base);
  return {
    id: overrides.id ?? resolved.id,
    vars: { ...resolved.vars, ...overrides.vars },
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
