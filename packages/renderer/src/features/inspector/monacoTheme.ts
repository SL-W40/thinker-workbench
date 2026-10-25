/**
 * 把设计体系 CSS token 同步成 Monaco 主题（颜色 / 语法着色）。
 * Monaco 不接受 var()，须读 computed 后写成具体色值。
 * 语法色统一走 `--md-hl-*`，与聊天代码块 / FileDiff 一致。
 */
import type * as Monaco from "monaco-editor";

/** 与 FileEditor `theme` prop 共用的主题名。 */
export const TW_MONACO_THEME = "tw-theme";

/** 稳定等宽栈——避免 UI `--font` 渗入编辑器。 */
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
 * 语法着色优先 `--md-hl-*`（浅/深色同一套映射）。
 */
/**
 * 已经应用到 Monaco 的色系。
 * applyMonacoTheme 要读约 20 次 getComputedStyle，再 defineTheme + setTheme ——
 * 后者会触发全编辑器 re-tokenize。编辑器每次挂载都会调它，同色系时整段跳过。
 */
let appliedScheme: "light" | "dark" | null = null;

export function applyMonacoTheme(
  monaco: typeof Monaco,
  colorScheme: "light" | "dark" = "light",
): void {
  // Monaco 与主题定义都是全局单例，同一色系重复应用没有意义，只会白白 re-tokenize
  if (appliedScheme === colorScheme) return;
  const dark = colorScheme === "dark";
  const bg = readColor("--tw-bg-elev", dark ? "#1e1e1e" : "#ffffff");
  const fg = readColor("--tw-fg", dark ? "#d4d4d4" : "#1e1e1e");
  const muted = readColor("--tw-fg-muted", dark ? "#9a9a9a" : "#666666");
  const accent = readColor("--tw-accent", dark ? "#c8c8c8" : "#333333");
  const accentStrong = readColor("--tw-accent-strong", accent);
  const hover = readColor("--tw-hover", dark ? "#ffffff14" : "#0000000f");
  const panel = readColor("--tw-panel", bg);
  const border = readColor("--tw-border", dark ? "#ffffff22" : "#00000022");
  const codeBg = readColor("--tw-code-bg", hover);

  // 语义高亮：与 markdown / FileDiff 共用 --md-hl-*，fallback 保证未注入时仍有区分度
  const keyword = readColor("--md-hl-keyword", dark ? "#569cd6" : "#0550ae");
  const string = readColor("--md-hl-string", dark ? "#ce9178" : "#116329");
  const number = readColor("--md-hl-number", dark ? "#b5cea8" : "#cf222e");
  const comment = readColor("--md-hl-comment", dark ? "#6a9955" : "#6e7781");
  const title = readColor("--md-hl-title", dark ? "#dcdcaa" : "#0550ae");
  const attr = readColor("--md-hl-attr", dark ? "#9cdcfe" : "#953800");
  const builtIn = readColor("--md-hl-built-in", dark ? "#4ec9b0" : "#0e7490");
  const literal = readColor("--md-hl-literal", keyword);
  const type = readColor("--md-hl-type", dark ? "#4ec9b0" : "#0e7490");
  const meta = readColor("--md-hl-meta", muted);

  monaco.editor.defineTheme(TW_MONACO_THEME, {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: ruleFg(comment), fontStyle: "italic" },
      { token: "string", foreground: ruleFg(string) },
      { token: "string.escape", foreground: ruleFg(meta) },
      { token: "number", foreground: ruleFg(number) },
      { token: "regexp", foreground: ruleFg(string) },
      { token: "keyword", foreground: ruleFg(keyword), fontStyle: "bold" },
      { token: "FAKESECRET_q3r4s5t6u7v8w9x0y1z2", foreground: ruleFg(keyword), fontStyle: "bold" },
      { token: "FAKESECRET_w4x5y6z7a8b9c0d1e2f3", foreground: ruleFg(literal), fontStyle: "bold" },
      { token: "type", foreground: ruleFg(type) },
      { token: "FAKESECRET_e1f2g3h4i5j6k7l8m9n0", foreground: ruleFg(type) },
      { token: "FAKESECRET_w4x5y6z7a8b9c0d1e2f3", foreground: ruleFg(type) },
      { token: "FAKESECRET_c2d3e4f5g6h7i8j9k0l1", foreground: ruleFg(title) },
      { token: "FAKESECRET_s2t3u4v5w6x7y8z9a0b1", foreground: ruleFg(attr) },
      { token: "FAKESECRET_m3n4o5p6q7r8s9t0u1v2", foreground: ruleFg(builtIn) },
      { token: "FAKESECRET_a1b2c3d4e5f6g7h8i9j0", foreground: ruleFg(title) },
      { token: "FAKESECRET_q2r3s4t5u6v7w8x9y0z1", foreground: ruleFg(meta) },
      { token: "FAKESECRET_o4p5q6r7s8t9u0v1w2x3", foreground: ruleFg(meta) },
      { token: "delimiter", foreground: ruleFg(muted) },
      { token: "FAKESECRET_q1r2s3t4u5v6w7x8y9z0", foreground: ruleFg(fg) },
      { token: "tag", foreground: ruleFg(keyword) },
      { token: "FAKESECRET_u4v5w6x7y8z9a0b1c2d3", foreground: ruleFg(attr) },
      { token: "FAKESECRET_k1l2m3n4o5p6q7r8s9t0", foreground: ruleFg(string) },
      { token: "FAKESECRET_i3j4k5l6m7n8o9p0q1r2", foreground: ruleFg(literal) },
      { token: "FAKESECRET_u3v4w5x6y7z8a9b0c1d2", foreground: ruleFg(number) },
      { token: "FAKESECRET_k3l4m5n6o7p8q9r0s1t2", foreground: ruleFg(keyword) },
      {
        token: "FAKESECRET_i1j2k3l4m5n6o7p8q9r0",
        foreground: ruleFg(comment),
        fontStyle: "italic",
      },
      { token: "FAKESECRET_k2l3m4n5o6p7q8r9s0t1", foreground: ruleFg(keyword) },
      { token: "FAKESECRET_i1j2k3l4m5n6o7p8q9r0", foreground: ruleFg(attr) },
      { token: "FAKESECRET_u1v2w3x4y5z6a7b8c9d0", foreground: ruleFg(string) },
      { token: "FAKESECRET_i2j3k4l5m6n7o8p9q0r1", foreground: ruleFg(keyword) },
      { token: "FAKESECRET_e1f2g3h4i5j6k7l8m9n0", foreground: ruleFg(attr) },
      { token: "FAKESECRET_y3z4a5b6c7d8e9f0g1h2", foreground: ruleFg(string) },
      { token: "FAKESECRET_k4l5m6n7o8p9q0r1s2t3", foreground: ruleFg(keyword) },
      { token: "FAKESECRET_i3j4k5l6m7n8o9p0q1r2", foreground: ruleFg(attr) },
      { token: "FAKESECRET_m4n5o6p7q8r9s0t1u2v3", foreground: ruleFg(string) },
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
      // 选中行必须高对比：浅底 + 深字（勿用偏淡的 keyword 色）
      "editorSuggestWidget.selectedBackground": toMonacoColor(
        getComputedStyle(document.documentElement).getPropertyValue("--tw-accent-soft").trim() ||
          "",
        dark ? "#3d3a35" : "#ddd4c6",
      ),
      "editorSuggestWidget.selectedForeground": fg,
      "editorSuggestWidget.selectedIconForeground": fg,
      "editorSuggestWidget.highlightForeground": accentStrong,
      "editorSuggestWidget.focusHighlightForeground": accentStrong,
      "editorIndentGuide.background1": border,
      "editorIndentGuide.activeBackground1": muted,
      "editorBracketMatch.background": codeBg,
      "editorBracketMatch.border": accent,
      "scrollbarSlider.background": border,
      "scrollbarSlider.hoverBackground": muted,
      focusBorder: "#00000000",
    },
  });
  monaco.editor.setTheme(TW_MONACO_THEME);
  appliedScheme = colorScheme;
}

/** 读取主题等宽字体；拼上稳定回退。 */
export function readMonacoFontFamily(): string {
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim();
  if (!mono) return TW_MONACO_FONT;
  return `${mono}, ${TW_MONACO_FONT}`;
}
