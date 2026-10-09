/**
 * Aurora 创意主题——深蓝夜空 + 青绿极光。
 */
import type { MarkdownTheme } from "./types";

const HAND = '"Segoe Print", "Bradley Hand", "Apple Chancery", "TW Hand", cursive';
const MONO = 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace';

/** Aurora——深蓝夜空 + 青绿极光。 */
export const auroraTheme: MarkdownTheme = {
  id: "aurora",
  vars: {
    "--md-fg": "#e8f4f2",
    "--md-fg-muted": "#8aa8b0",
    "--md-bg": "transparent",
    "--md-accent": "#5eead4",
    "--md-border": "rgba(94, 234, 212, 0.2)",
    "--md-panel": "#121a2b",
    "--md-code-bg": "#1a2438",
    "--md-code-fg": "#e8f4f2",
    "--md-pre-bg": "#070b14",
    "--md-pre-fg": "#e8f4f2",
    "--md-blockquote-bg": "rgba(94, 234, 212, 0.08)",
    "--md-table-head": "rgba(94, 234, 212, 0.08)",
    "--md-danger": "#fb7185",
    "--md-danger-bg": "rgba(251, 113, 133, 0.12)",
    "--md-shadow-soft": "rgba(0, 0, 0, 0.35)",
    "--md-stream-glow": "rgba(94, 234, 212, 0.22)",
    "--md-font-mono": MONO,
    "--md-font-hand": HAND,
    "--md-hl-keyword": "#5eead4",
    "--md-hl-string": "#a5b4fc",
    "--md-hl-number": "#f9a8d4",
    "--md-hl-comment": "#64748b",
    "--md-hl-title": "#e8f4f2",
    "--md-hl-attr": "#c4b5fd",
    "--md-hl-built-in": "#67e8f9",
    "--md-hl-literal": "#5eead4",
    "--md-hl-type": "#93c5fd",
    "--md-hl-meta": "#fde68a",
    "--md-mermaid-dark": "true",
    "--md-mermaid-paper": "#121a2b",
    "--md-mermaid-rule": "rgba(94, 234, 212, 0.1)",
    "--md-mermaid-margin": "rgba(167, 139, 250, 0.1)",
    "--md-mermaid-glow": "rgba(94, 234, 212, 0.12)",
    "--md-mermaid-font-size": "16px",
    "--md-mermaid-primary": "#1a2a3d",
    "--md-mermaid-primary-text": "#e8f4f2",
    "--md-mermaid-primary-border": "#5eead4",
    "--md-mermaid-secondary": "#152033",
    "--md-mermaid-secondary-text": "#e8f4f2",
    "--md-mermaid-secondary-border": "#67e8f9",
    "--md-mermaid-tertiary": "#243048",
    "--md-mermaid-tertiary-text": "#e8f4f2",
    "--md-mermaid-tertiary-border": "#a78bfa",
    "--md-mermaid-line": "#8aa8b0",
    "--md-mermaid-text": "#e8f4f2",
    "--md-mermaid-cluster": "#0b1220",
    "--md-mermaid-cluster-border": "#334155",
    "--md-mermaid-note": "#243048",
    "--md-mermaid-note-border": "#a78bfa",
    "--md-mermaid-activation": "#1e3a4a",
    "--md-mermaid-actor-line": "#67e8f9",
  },
  mermaid: {
    theme: "base",
    look: "handDrawn",
  },
};
