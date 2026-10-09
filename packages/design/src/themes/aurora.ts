/**
 * Aurora 创意主题——深蓝夜空 + 青绿极光。
 */
import { auroraTheme as mdAurora } from "@thinker-workbench/markdown";
import type { DesignTheme } from "./types";
import { notesChrome } from "./chrome";

const HAND = mdAurora.vars["--md-font-hand"] ?? "";
const MONO = mdAurora.vars["--md-font-mono"] ?? "";

/** Aurora——深蓝夜空 + 青绿极光。 */
export const auroraTheme: DesignTheme = {
  id: "aurora",
  colorScheme: "dark",
  ui: {
    "--tw-bg": "#0b1220",
    "--tw-bg-elev": "#121a2b",
    "--tw-fg": "#e8f4f2",
    "--tw-fg-muted": "#8aa8b0",
    "--tw-border": "rgba(94, 234, 212, 0.2)",
    "--tw-panel": "#121a2b",
    "--tw-accent": "#5eead4",
    "--tw-accent-strong": "#2dd4bf",
    "--tw-accent-ink": "#0b1220",
    "--tw-accent-soft": "rgba(94, 234, 212, 0.12)",
    "--tw-accent-ring": "rgba(94, 234, 212, 0.45)",
    "--tw-danger": "#fb7185",
    "--tw-danger-bg": "rgba(251, 113, 133, 0.12)",
    "--tw-code-bg": "#1a2438",
    "--tw-placeholder": "rgba(138, 168, 176, 0.7)",
    "--tw-hover": "rgba(232, 244, 242, 0.06)",
    "--tw-font-body": '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif',
    "--tw-font-hand": HAND,
    "--tw-font-mono": MONO,
    "--tw-radius": "14px",
    "--tw-radius-control": "10px",
    "--tw-shadow-soft": "rgba(0, 0, 0, 0.35)",
    ...notesChrome({
      paperRule: "rgba(94, 234, 212, 0.08)",
      paperMargin: "rgba(167, 139, 250, 0.12)",
      paperGlow: "rgba(94, 234, 212, 0.1)",
      titlebarBg: "rgba(11, 18, 32, 0.94)",
      barBg: "rgba(11, 18, 32, 0.96)",
      dockFade: "rgba(11, 18, 32, 0.96)",
      panelSolid: "rgba(18, 26, 43, 0.96)",
      panelMuted: "rgba(11, 18, 32, 0.88)",
      inkFade: "rgba(232, 244, 242, 0.04)",
      inkFadeStrong: "rgba(232, 244, 242, 0.08)",
      user: "#1a2438",
      scrollbarThumb: "rgba(94, 234, 212, 0.28)",
      scrollbarThumbHover: "rgba(94, 234, 212, 0.5)",
      accentSoftStrong: "rgba(94, 234, 212, 0.32)",
      accentSoftMuted: "rgba(94, 234, 212, 0.1)",
      accentGlow: "rgba(94, 234, 212, 0.2)",
      winClose: "#fb7185",
      winCloseInk: "#0b1220",
    }),
  },
  markdown: { ...mdAurora.vars },
  mermaid: { ...mdAurora.mermaid },
};
