/**
 * 自定义主题：从现有色板克隆快照、颜色值检测等纯函数。
 */
import { resolveUiTheme, type DesignTheme } from "@thinker-workbench/design";
import {
  createCustomThemeId,
  type CustomThemeRecord,
  type CustomThemeSnapshot,
} from "@thinker-workbench/shared";

/** 将 DesignTheme 转为可持久化快照（强制 id）。 */
export function designThemeToSnapshot(theme: DesignTheme, id: string): CustomThemeSnapshot {
  return {
    id,
    ...(theme.colorScheme ? { colorScheme: theme.colorScheme } : {}),
    ...(theme.typeStyle ? { typeStyle: theme.typeStyle } : {}),
    ui: { ...theme.ui },
    markdown: { ...theme.markdown },
    mermaid: {
      theme: theme.mermaid.theme,
      ...(theme.mermaid.look ? { look: theme.mermaid.look } : {}),
      ...(theme.mermaid.themeVariables
        ? { themeVariables: { ...theme.mermaid.themeVariables } }
        : {}),
    },
  };
}

/**
 * 基于现有主题（内置或自定义）派生新记录。
 */
export function forkCustomTheme(options: {
  sourceId: string;
  customs: readonly CustomThemeRecord[];
  prefersDark: boolean;
  name: string;
}): CustomThemeRecord {
  const id = createCustomThemeId();
  const base = resolveUiTheme(options.sourceId, options.customs, options.prefersDark);
  return {
    id,
    name: options.name.slice(0, 64),
    basedOn: options.sourceId,
    theme: designThemeToSnapshot(base, id),
  };
}

/** 是否像颜色字面量（供编辑器选用色板控件）。 */
export function looksLikeColor(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^#([0-9a-f]{3,8})$/i.test(v)) return true;
  if (/^rgba?\(/i.test(v)) return true;
  if (/^hsla?\(/i.test(v)) return true;
  return false;
}

/** 把任意 CSS 颜色尽量压成 `<input type="color">` 可用的 `#rrggbb`。 */
export function toColorInputValue(value: string): string {
  const v = value.trim();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const h = hex[1]!;
    if (h.length === 3) {
      return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    }
    return `#${h.slice(0, 6)}`;
  }
  const rgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    const r = Math.min(255, Number(rgb[1]));
    const g = Math.min(255, Number(rgb[2]));
    const b = Math.min(255, Number(rgb[3]));
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  return "#888888";
}

/** 深拷贝一条自定义主题记录。 */
export function cloneCustomThemeRecord(record: CustomThemeRecord): CustomThemeRecord {
  return {
    id: record.id,
    name: record.name,
    ...(record.basedOn ? { basedOn: record.basedOn } : {}),
    theme: designThemeToSnapshot(
      {
        id: record.theme.id,
        colorScheme: record.theme.colorScheme,
        typeStyle: record.theme.typeStyle,
        ui: { ...record.theme.ui },
        markdown: { ...record.theme.markdown },
        mermaid: {
          theme: (record.theme.mermaid.theme as DesignTheme["mermaid"]["theme"]) ?? "neutral",
          look: record.theme.mermaid.look as DesignTheme["mermaid"]["look"],
          themeVariables: { ...record.theme.mermaid.themeVariables },
        },
      },
      record.id,
    ),
  };
}
