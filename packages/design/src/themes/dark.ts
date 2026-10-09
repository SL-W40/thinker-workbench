/**
 * 基础深色主题——黑白灰极简（夜间）。
 */
import { darkTheme as mdDark } from "@thinker-workbench/markdown";
import type { DesignTheme } from "./types";
import { notesChrome } from "./chrome";

const SANS =
  mdDark.vars["--md-font-hand"] ?? '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';
const MONO = mdDark.vars["--md-font-mono"] ?? "";

/** 基础深色——黑白灰极简。 */
export const darkTheme: DesignTheme = {
  id: "dark",
  colorScheme: "dark",
  ui: {
    "--tw-bg": "#111111",
    "--tw-bg-elev": "#1a1a1a",
    "--tw-fg": "#f2f2f2",
    "--tw-fg-muted": "#a0a0a0",
    "--tw-border": "rgba(255, 255, 255, 0.14)",
    "--tw-panel": "#1a1a1a",
    "--tw-accent": "#f2f2f2",
    "--tw-accent-strong": "#ffffff",
    "--tw-accent-ink": "#111111",
    "--tw-accent-soft": "rgba(255, 255, 255, 0.08)",
    "--tw-accent-ring": "rgba(255, 255, 255, 0.35)",
    "--tw-danger": "#ff8a80",
    "--tw-danger-bg": "rgba(255, 138, 128, 0.12)",
    "--tw-code-bg": "#242424",
    "--tw-placeholder": "rgba(255, 255, 255, 0.4)",
    "--tw-hover": "rgba(255, 255, 255, 0.06)",
    "--tw-font-body": SANS,
    "--tw-font-hand": SANS,
    "--tw-font-mono": MONO,
    "--tw-radius": "10px",
    "--tw-radius-control": "8px",
    "--tw-shadow-soft": "rgba(0, 0, 0, 0.35)",
    ...notesChrome({
      paperRule: "rgba(255, 255, 255, 0.06)",
      paperMargin: "rgba(255, 255, 255, 0.04)",
      paperGlow: "transparent",
      titlebarBg: "rgba(17, 17, 17, 0.94)",
      barBg: "rgba(17, 17, 17, 0.96)",
      dockFade: "rgba(17, 17, 17, 0.96)",
      panelSolid: "rgba(26, 26, 26, 0.96)",
      panelMuted: "rgba(17, 17, 17, 0.88)",
      inkFade: "rgba(255, 255, 255, 0.04)",
      inkFadeStrong: "rgba(255, 255, 255, 0.08)",
      user: "#242424",
      scrollbarThumb: "rgba(255, 255, 255, 0.22)",
      scrollbarThumbHover: "rgba(255, 255, 255, 0.4)",
      accentSoftStrong: "rgba(255, 255, 255, 0.2)",
      accentSoftMuted: "rgba(255, 255, 255, 0.08)",
      accentGlow: "transparent",
      winClose: "#ff8a80",
      winCloseInk: "#111111",
    }),
  },
  markdown: { ...mdDark.vars },
  mermaid: { ...mdDark.mermaid },
};
