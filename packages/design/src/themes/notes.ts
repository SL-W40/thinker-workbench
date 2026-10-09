/**
 * Notes 创意主题——暖色笔记纸面（原 paper / light）。
 */
import { notesTheme as mdNotes } from "@thinker-workbench/markdown";
import type { DesignTheme } from "./types";
import { notesChrome } from "./chrome";

const HAND = mdNotes.vars["--md-font-hand"] ?? "";
const MONO = mdNotes.vars["--md-font-mono"] ?? "";

/** Notes——暖色笔记纸面。 */
export const notesTheme: DesignTheme = {
  id: "notes",
  colorScheme: "light",
  ui: {
    "--tw-bg": "#f4ebe0",
    "--tw-bg-elev": "#f7efe3",
    "--tw-fg": "#2a2218",
    "--tw-fg-muted": "#6b5344",
    "--tw-border": "rgba(90, 70, 50, 0.18)",
    "--tw-panel": "#f7efe3",
    "--tw-accent": "#6b5344",
    "--tw-accent-strong": "#5c4033",
    "--tw-accent-ink": "#f4ebe0",
    "--tw-accent-soft": "rgba(107, 83, 68, 0.12)",
    "--tw-accent-ring": "rgba(107, 83, 68, 0.45)",
    "--tw-danger": "#9b3b2e",
    "--tw-danger-bg": "rgba(155, 59, 46, 0.08)",
    "--tw-code-bg": "#efe2cc",
    "--tw-placeholder": "rgba(107, 83, 68, 0.7)",
    "--tw-hover": "rgba(42, 34, 24, 0.06)",
    "--tw-font-body": '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif',
    "--tw-font-hand": HAND,
    "--tw-font-mono": MONO,
    "--tw-radius": "14px",
    "--tw-radius-control": "10px",
    "--tw-shadow-soft": "rgba(90, 70, 50, 0.06)",
    ...notesChrome({
      paperRule: "rgba(120, 90, 60, 0.12)",
      paperMargin: "rgba(180, 120, 90, 0.14)",
      paperGlow: "rgba(196, 165, 116, 0.2)",
      titlebarBg: "rgba(244, 235, 224, 0.92)",
      barBg: "rgba(244, 235, 224, 0.94)",
      dockFade: "rgba(244, 235, 224, 0.96)",
      panelSolid: "rgba(247, 239, 227, 0.96)",
      panelMuted: "rgba(244, 235, 224, 0.82)",
      inkFade: "rgba(42, 34, 24, 0.05)",
      inkFadeStrong: "rgba(42, 34, 24, 0.08)",
      user: "#efe2cc",
      scrollbarThumb: "rgba(90, 70, 50, 0.22)",
      scrollbarThumbHover: "rgba(107, 83, 68, 0.5)",
      accentSoftStrong: "rgba(107, 83, 68, 0.35)",
      accentSoftMuted: "rgba(107, 83, 68, 0.1)",
      accentGlow: "rgba(196, 165, 116, 0.22)",
      winClose: "#9b3b2e",
      winCloseInk: "#f7efe3",
    }),
  },
  markdown: { ...mdNotes.vars },
  mermaid: { ...mdNotes.mermaid },
};
