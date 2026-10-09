/**
 * 护眼创意主题——柔和灰绿，适合长时间阅读。
 */
import { eyecareTheme as mdEyecare } from "@thinker-workbench/markdown";
import type { DesignTheme } from "./types";
import { notesChrome } from "./chrome";

const HAND = mdEyecare.vars["--md-font-hand"] ?? "";
const MONO = mdEyecare.vars["--md-font-mono"] ?? "";

/** 护眼——柔和灰绿。 */
export const eyecareTheme: DesignTheme = {
  id: "eyecare",
  colorScheme: "light",
  ui: {
    "--tw-bg": "#eef2e6",
    "--tw-bg-elev": "#f4f6ee",
    "--tw-fg": "#2f3a2c",
    "--tw-fg-muted": "#5f6d5a",
    "--tw-border": "rgba(79, 111, 82, 0.2)",
    "--tw-panel": "#f4f6ee",
    "--tw-accent": "#4f6f52",
    "--tw-accent-strong": "#3f5a42",
    "--tw-accent-ink": "#eef2e6",
    "--tw-accent-soft": "rgba(79, 111, 82, 0.12)",
    "--tw-accent-ring": "rgba(79, 111, 82, 0.4)",
    "--tw-danger": "#9b3b2e",
    "--tw-danger-bg": "rgba(155, 59, 46, 0.1)",
    "--tw-code-bg": "#e2e8d8",
    "--tw-placeholder": "rgba(95, 109, 90, 0.7)",
    "--tw-hover": "rgba(47, 58, 44, 0.06)",
    "--tw-font-body": '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif',
    "--tw-font-hand": HAND,
    "--tw-font-mono": MONO,
    "--tw-radius": "14px",
    "--tw-radius-control": "10px",
    "--tw-shadow-soft": "rgba(47, 58, 44, 0.08)",
    ...notesChrome({
      paperRule: "rgba(79, 111, 82, 0.1)",
      paperMargin: "rgba(79, 111, 82, 0.12)",
      paperGlow: "rgba(79, 111, 82, 0.12)",
      titlebarBg: "rgba(238, 242, 230, 0.94)",
      barBg: "rgba(238, 242, 230, 0.96)",
      dockFade: "rgba(238, 242, 230, 0.96)",
      panelSolid: "rgba(244, 246, 238, 0.96)",
      panelMuted: "rgba(238, 242, 230, 0.86)",
      inkFade: "rgba(47, 58, 44, 0.04)",
      inkFadeStrong: "rgba(47, 58, 44, 0.08)",
      user: "#e2e8d8",
      scrollbarThumb: "rgba(79, 111, 82, 0.28)",
      scrollbarThumbHover: "rgba(79, 111, 82, 0.48)",
      accentSoftStrong: "rgba(79, 111, 82, 0.32)",
      accentSoftMuted: "rgba(79, 111, 82, 0.1)",
      accentGlow: "rgba(79, 111, 82, 0.16)",
      winClose: "#9b3b2e",
      winCloseInk: "#f4f6ee",
    }),
  },
  markdown: { ...mdEyecare.vars },
  mermaid: { ...mdEyecare.mermaid },
};
