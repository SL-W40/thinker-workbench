/**
 * 把设计体系 CSS token 同步成 Monaco 主题（颜色 / 语法着色）。
 * Monaco 不接受 var()，须读 computed 后写成具体色值。
 */
import type * as Monaco from "monaco-editor";

/** 与 FileEditor `theme` prop 共用的主题名。 */
export const TW_MONACO_THEME = "tw-theme";

/** 稳定等宽栈——避免手写体 `--font` 渗入编辑器。 */
export const TW_MONACO_FONT =
  'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Monaco, "Cascadia Code", Consolas, monospace';

/** 将任意 CSS 颜色规范为 Monaco 可用的 #RRGGBB / #RRGGBBAA。 */
function toMonacoColor(input: string, fallback: string): string {
  const v = input.trim();
  if (!v) return fallback;
  if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) return v;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallback;
  ctx.fillStyle = "#000000";
  ctx.fillStyle = v;
  const resolved = String(ctx.fillStyle);
  if (resolved.startsWith("#")) return resolved;

  const m = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  if (!m) return fallback;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = m[4] !== undefined ? Math.round(Number(m[4]) * 255) : null;
  const base = `#${hex(r)}${hex(g)}${hex(b)}`;
  return a !== null && a < 255 ? `${base}${hex(a)}` : base;
}

function readColor(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  return toMonacoColor(raw, fallback);
}

/** rules.foreground 要无 # 的 RRGGBB。 */
function ruleFg(hex: string): string {
  return hex.replace(/^#/, "").slice(0, 6);
}

/**
 * 按当前 document 上的主题 token 定义并激活 `tw-theme`。
 * 浅色用 UI 语义色；深色优先用 markdown 高亮 token（面向深色代码块）。
 */
export function applyMonacoTheme(
  monaco: typeof Monaco,
  colorScheme: "light" | "dark" = "light",
): void {
  const dark = colorScheme === "dark";
  const bg = readColor("--tw-bg-elev", dark ? "#1e1e1e" : "#ffffff");
  const fg = readColor("--tw-fg", dark ? "#d4d4d4" : "#1e1e1e");
  const muted = readColor("--tw-fg-muted", dark ? "#9a9a9a" : "#666666");
  const accent = readColor("--tw-accent", dark ? "#c8c8c8" : "#333333");
  const accentStrong = readColor("--tw-accent-strong", accent);
  const danger = readColor("--tw-danger", dark ? "#ff8a80" : "#9b3b2e");
  const hover = readColor("--tw-hover", dark ? "#ffffff14" : "#0000000f");
  const panel = readColor("--tw-panel", bg);
  const border = readColor("--tw-border", dark ? "#ffffff22" : "#00000022");
  const codeBg = readColor("--tw-code-bg", hover);

  const keyword = dark
    ? readColor("--md-hl-keyword", accent)
    : accentStrong;
  const string = dark
    ? readColor("--md-hl-string", muted)
    : readColor("--tw-accent", "#3d6b4f");
  const number = dark ? readColor("--md-hl-number", danger) : danger;
  const comment = dark ? readColor("--md-hl-comment", muted) : muted;
  const type = dark ? readColor("--md-hl-type", fg) : accent;
  const literal = dark ? readColor("--md-hl-literal", keyword) : accentStrong;

  monaco.editor.defineTheme(TW_MONACO_THEME, {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: ruleFg(comment), fontStyle: "italic" },
      { token: "string", foreground: ruleFg(string) },
      { token: "number", foreground: ruleFg(number) },
      { token: "keyword", foreground: ruleFg(keyword), fontStyle: "bold" },
      { token: "type", foreground: ruleFg(type) },
      { token: "delimiter", foreground: ruleFg(muted) },
      { token: "FAKESECRET_q1r2s3t4u5v6w7x8y9z0", foreground: ruleFg(muted) },
      { token: "FAKESECRET_u4v5w6x7y8z9a0b1c2d3", foreground: ruleFg(accent) },
      { token: "FAKESECRET_k1l2m3n4o5p6q7r8s9t0", foreground: ruleFg(string) },
      { token: "FAKESECRET_i3j4k5l6m7n8o9p0q1r2", foreground: ruleFg(literal) },
      { token: "FAKESECRET_u3v4w5x6y7z8a9b0c1d2", foreground: ruleFg(number) },
      { token: "FAKESECRET_k3l4m5n6o7p8q9r0s1t2", foreground: ruleFg(keyword) },
      { token: "FAKESECRET_i1j2k3l4m5n6o7p8q9r0", foreground: ruleFg(comment), fontStyle: "italic" },
    ],
    colors: {
      "editor.background": bg,
      // 行号栏与编辑区同色，避免左右分栏色块
      "editorGutter.background": bg,
      "editor.foreground": fg,
      "editorLineNumber.foreground": muted,
      "editorLineNumber.activeForeground": fg,
      "editorCursor.foreground": accentStrong,
      "editor.selectionBackground": toMonacoColor(
        getComputedStyle(document.documentElement).getPropertyValue("--tw-accent-soft").trim() ||
          hover,
        hover,
      ),
      "editor.inactiveSelectionBackground": hover,
      "editor.lineHighlightBackground": hover,
      "editor.lineHighlightBorder": "#00000000",
      "editorWidget.background": panel,
      "editorWidget.border": border,
      "editorSuggestWidget.background": panel,
      "editorSuggestWidget.border": border,
      "editorSuggestWidget.foreground": fg,
      "editorSuggestWidget.selectedBackground": codeBg,
      "editorIndentGuide.background1": border,
      "editorIndentGuide.activeBackground1": muted,
      "editorBracketMatch.background": codeBg,
      "editorBracketMatch.border": accent,
      "scrollbarSlider.background": border,
      "scrollbarSlider.hoverBackground": muted,
      "focusBorder": "#00000000",
    },
  });
  monaco.editor.setTheme(TW_MONACO_THEME);
}

/** 读取主题等宽字体；拼上稳定回退，避免落到手写体。 */
export function readMonacoFontFamily(): string {
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim();
  if (!mono) return TW_MONACO_FONT;
  return `${mono}, ${TW_MONACO_FONT}`;
}
