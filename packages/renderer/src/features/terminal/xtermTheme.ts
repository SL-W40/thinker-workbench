/**
 * 从设计主题 / CSS token 构建 xterm 配色，保证跟应用外观一致且可读。
 */
import type { DesignTheme } from "@thinker-workbench/design";
import type { ITheme } from "@xterm/xterm";

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function pick(
  ui: DesignTheme["ui"] | undefined,
  key: keyof DesignTheme["ui"],
  cssName: string,
  fallback: string,
): string {
  const fromTheme = ui?.[key];
  if (typeof fromTheme === "string" && fromTheme.trim()) return fromTheme.trim();
  return cssVar(cssName, fallback);
}

/** 根据当前设计主题构建 xterm ITheme（优先 theme.ui，回退 CSS 变量）。 */
export function readXtermTheme(theme?: DesignTheme | null): ITheme {
  const ui = theme?.ui;
  const fg = pick(ui, "--tw-fg", "--tw-fg", cssVar("--ink", "#e6e6e6"));
  const bg = pick(ui, "--tw-bg", "--tw-bg", cssVar("--bg", "#1a1a1a"));
  const codeBg = pick(ui, "--tw-code-bg", "--tw-code-bg", "");
  const elev = pick(ui, "--tw-bg-elev", "--tw-bg-elev", bg);
  // 终端面优先代码背景，其次 elev，避免浅色主题「白板一块」不像终端
  const surface =
    codeBg ||
    cssVar("--md-pre-bg", "") ||
    elev ||
    bg;
  const accent = pick(ui, "--tw-accent", "--tw-accent", cssVar("--accent", fg));
  const muted = pick(ui, "--tw-fg-muted", "--tw-fg-muted", cssVar("--muted", fg));
  const danger = pick(ui, "--tw-danger", "--tw-danger", cssVar("--danger", "#f07178"));
  const soft = pick(ui, "--tw-accent-soft", "--tw-accent-soft", "rgba(127,127,127,0.35)");
  // 与 design.less 全局滚动条 token 对齐
  const scrollThumb = cssVar("--scrollbar-thumb", "rgba(90, 70, 50, 0.22)");
  const scrollThumbHover = cssVar("--scrollbar-thumb-hover", "rgba(107, 83, 68, 0.5)");

  return {
    foreground: fg,
    background: surface,
    cursor: accent,
    cursorAccent: surface,
    selectionBackground: soft,
    selectionForeground: fg,
    scrollbarSliderBackground: scrollThumb,
    scrollbarSliderHoverBackground: scrollThumbHover,
    scrollbarSliderActiveBackground: scrollThumbHover,
    // overviewRuler.width 开启后会画分隔竖线；与终端底同色消掉
    overviewRulerBorder: surface,
    black: muted,
    red: danger,
    green: "#3ecf8e",
    yellow: "#d4a017",
    blue: "#4da3ff",
    magenta: "#c678dd",
    cyan: "#56b6c2",
    white: fg,
    brightBlack: muted,
    brightRed: danger,
    brightGreen: "#3ecf8e",
    brightYellow: "#d4a017",
    brightBlue: "#4da3ff",
    brightMagenta: "#c678dd",
    brightCyan: "#56b6c2",
    brightWhite: fg,
  };
}

/** 同步宿主 DOM 背景，避免 xterm canvas 与外层脱节。 */
export function applyTerminalHostColors(
  host: HTMLElement | null,
  theme?: DesignTheme | null,
): void {
  if (!host) return;
  const t = readXtermTheme(theme);
  host.style.backgroundColor = t.background ?? "";
  host.style.color = t.foreground ?? "";
}
