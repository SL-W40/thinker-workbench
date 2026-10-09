/**
 * 基础浅色主题——黑白灰极简。
 */
import { lightTheme as mdLight } from "@thinker-workbench/markdown";
import type { DesignTheme } from "./types";
import { notesChrome } from "./chrome";

const SANS =
  mdLight.vars["--md-font-hand"] ?? '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';
const MONO = mdLight.vars["--md-font-mono"] ?? "";

/** 基础浅色——黑白灰极简。 */
export const lightTheme: DesignTheme = {
  id: "light",
  colorScheme: "light",
  ui: {
    "--tw-bg": "#ffffff",
    "--tw-bg-elev": "#f7f7f7",
    "--tw-fg": "#111111",
    "--tw-fg-muted": "#666666",
    "--tw-border": "rgba(0, 0, 0, 0.12)",
    "--tw-panel": "#f7f7f7",
    "--tw-accent": "#111111",
    "--tw-accent-strong": "#000000",
    "--tw-accent-ink": "#ffffff",
    "--tw-accent-soft": "rgba(0, 0, 0, 0.06)",
    "--tw-accent-ring": "rgba(0, 0, 0, 0.35)",
    "--tw-danger": "#b00020",
    "--tw-danger-bg": "rgba(176, 0, 32, 0.08)",
    "--tw-code-bg": "#efefef",
    "--tw-placeholder": "rgba(0, 0, 0, 0.4)",
    "--tw-hover": "rgba(0, 0, 0, 0.05)",
    "--tw-font-body": SANS,
    "--tw-font-hand": SANS,
    "--tw-font-mono": MONO,
    "--tw-radius": "10px",
    "--tw-radius-control": "8px",
    "--tw-shadow-soft": "rgba(0, 0, 0, 0.08)",
    ...notesChrome({
      paperRule: "rgba(0, 0, 0, 0.05)",
      paperMargin: "rgba(0, 0, 0, 0.03)",
      paperGlow: "transparent",
      titlebarBg: "rgba(255, 255, 255, 0.94)",
      barBg: "rgba(255, 255, 255, 0.96)",
      dockFade: "rgba(255, 255, 255, 0.96)",
      panelSolid: "rgba(247, 247, 247, 0.96)",
      panelMuted: "rgba(255, 255, 255, 0.88)",
      inkFade: "rgba(0, 0, 0, 0.04)",
      inkFadeStrong: "rgba(0, 0, 0, 0.07)",
      user: "#efefef",
      scrollbarThumb: "rgba(0, 0, 0, 0.18)",
      scrollbarThumbHover: "rgba(0, 0, 0, 0.4)",
      accentSoftStrong: "rgba(0, 0, 0, 0.2)",
      accentSoftMuted: "rgba(0, 0, 0, 0.06)",
      accentGlow: "transparent",
      winClose: "#b00020",
      winCloseInk: "#ffffff",
    }),
  },
  markdown: { ...mdLight.vars },
  mermaid: { ...mdLight.mermaid },
};
