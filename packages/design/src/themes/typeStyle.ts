/**
 * 字型风格：手写展示字体 + 手绘 Mermaid，或常规无衬线 + 经典图表。
 */
import { notesTheme as mdNotes } from "@thinker-workbench/markdown";
import { createDesignTheme, resolveDesignTheme } from "./apply";
import type { DesignTheme, DesignThemeInput } from "./types";

/** 手写展示字体 + 手绘 Mermaid，或常规无衬线 + 经典图表。 */
export type DesignTypeStyle = "hand" | "regular";

const FALLBACK_SANS = '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';
/** 规范手写字体栈——即使色板主题（如 light）把 sans 写进 `--tw-font-hand` 也使用此栈。 */
const HAND_STACK =
  mdNotes.vars["--md-font-hand"] ||
  '"Segoe Print", "Bradley Hand", "Apple Chancery", "TW Hand", cursive';

/**
 * 把色板主题与字型风格合成。
 * `base` 可为内置 id 或完整主题对象（自定义主题须传对象，避免按 id 回落到内置）。
 * 再覆盖字体 / Mermaid `look`，使 `hand` 与 `regular` 在每个色板上都可见。
 */
export function applyTypeStyle(
  base: DesignThemeInput,
  style: DesignTypeStyle = "regular",
): DesignTheme {
  const resolved = resolveDesignTheme(base);
  const body = resolved.ui["--tw-font-body"] || FALLBACK_SANS;

  if (style === "regular") {
    return {
      ...createDesignTheme(resolved, {
        id: resolved.id,
        ui: {
          "--tw-font-hand": body,
          "--tw-font-ui": body,
        },
        markdown: { "--md-font-hand": body },
        mermaid: {
          theme: resolved.mermaid.theme,
          look: "classic",
        },
      }),
      typeStyle: "regular",
    };
  }

  return {
    ...createDesignTheme(resolved, {
      id: resolved.id,
      ui: {
        "--tw-font-hand": HAND_STACK,
        "--tw-font-ui": HAND_STACK,
      },
      markdown: { "--md-font-hand": HAND_STACK },
      mermaid: {
        theme: resolved.mermaid.theme,
        look: "handDrawn",
      },
    }),
    typeStyle: "hand",
  };
}
