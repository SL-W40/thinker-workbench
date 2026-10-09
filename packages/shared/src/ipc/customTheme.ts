/**
 * 用户自定义主题：完整色板快照 + 显示名，持久化于 general.customThemes。
 */

/** 自定义主题 id 前缀（与内置 id 隔离）。 */
export const CUSTOM_THEME_ID_PREFIX = "custom_";

/** 自定义主题数量上限。 */
export const MAX_CUSTOM_THEMES = 24;

/** 导入/导出 JSON 格式标识。 */
export const CUSTOM_THEME_FORMAT = "thinker-theme/v1";

/** Mermaid 主题切片（与 design/markdown 对齐的可序列化子集）。 */
export type CustomThemeMermaid = {
  theme?: string;
  look?: string;
  themeVariables?: Record<string, string>;
};

/**
 * 完整主题快照（与 DesignTheme 同形，避免 shared 依赖 design）。
 * `id` 须等于所属 CustomThemeRecord.id。
 */
export type CustomThemeSnapshot = {
  id: string;
  colorScheme?: "light" | "dark";
  typeStyle?: "hand" | "regular";
  ui: Record<string, string>;
  markdown: Record<string, string>;
  mermaid: CustomThemeMermaid;
};

/** 一条用户自定义主题。 */
export type CustomThemeRecord = {
  /** `custom_<id>`。 */
  id: string;
  /** 显示名。 */
  name: string;
  /** 派生源主题 id（元数据，解析不依赖）。 */
  basedOn?: string;
  /** 完整色板快照。 */
  theme: CustomThemeSnapshot;
};

/** 单主题导入/导出信封。 */
export type CustomThemeExport = {
  format: typeof CUSTOM_THEME_FORMAT;
  name: string;
  basedOn?: string;
  theme: CustomThemeSnapshot;
};

/** 是否为自定义主题 id。 */
export function isCustomThemeId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(CUSTOM_THEME_ID_PREFIX) && value.length > CUSTOM_THEME_ID_PREFIX.length;
}

/** 生成新的自定义主题 id。 */
export function createCustomThemeId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const rand =
    typeof c?.randomUUID === "function"
      ? c.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${CUSTOM_THEME_ID_PREFIX}${rand}`;
}

/** 将任意对象规范为字符串字典（丢弃非字符串值）。 */
function normalizeStringMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** 规范 Mermaid 切片。 */
function normalizeMermaid(raw: unknown): CustomThemeMermaid {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const themeVariables = normalizeStringMap(obj.themeVariables);
  return {
    ...(typeof obj.theme === "string" ? { theme: obj.theme } : {}),
    ...(typeof obj.look === "string" ? { look: obj.look } : {}),
    ...(Object.keys(themeVariables).length ? { themeVariables } : {}),
  };
}

/**
 * 规范单条主题快照；`id` 强制为 recordId。
 * ui/markdown 皆空时视为无效。
 */
export function normalizeCustomThemeSnapshot(
  raw: unknown,
  recordId: string,
): CustomThemeSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const ui = normalizeStringMap(obj.ui);
  const markdown = normalizeStringMap(obj.markdown);
  if (!Object.keys(ui).length && !Object.keys(markdown).length) return null;
  const colorScheme = obj.colorScheme === "dark" || obj.colorScheme === "light" ? obj.colorScheme : undefined;
  const typeStyle = obj.typeStyle === "hand" || obj.typeStyle === "regular" ? obj.typeStyle : undefined;
  return {
    id: recordId,
    ...(colorScheme ? { colorScheme } : {}),
    ...(typeStyle ? { typeStyle } : {}),
    ui,
    markdown,
    mermaid: normalizeMermaid(obj.mermaid),
  };
}

/**
 * 规范自定义主题列表：去重 id、截断上限、丢弃非法项。
 */
export function normalizeCustomThemes(raw: unknown): CustomThemeRecord[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomThemeRecord[] = [];
  for (const item of raw) {
    if (out.length >= MAX_CUSTOM_THEMES) break;
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id =
      typeof obj.id === "string" && isCustomThemeId(obj.id) ? obj.id : null;
    if (!id || seen.has(id)) continue;
    const name =
      typeof obj.name === "string" && obj.name.trim()
        ? obj.name.trim().slice(0, 64)
        : id;
    const theme = normalizeCustomThemeSnapshot(obj.theme, id);
    if (!theme) continue;
    seen.add(id);
    out.push({
      id,
      name,
      ...(typeof obj.basedOn === "string" && obj.basedOn.trim()
        ? { basedOn: obj.basedOn.trim().slice(0, 64) }
        : {}),
      theme,
    });
  }
  return out;
}

/**
 * 解析导入 JSON；失败返回 null。
 * 始终分配新 id，避免与本地冲突。
 */
export function parseCustomThemeExport(raw: unknown): {
  name: string;
  basedOn?: string;
  theme: CustomThemeSnapshot;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.format !== CUSTOM_THEME_FORMAT) return null;
  const id = createCustomThemeId();
  const theme = normalizeCustomThemeSnapshot(obj.theme, id);
  if (!theme) return null;
  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim().slice(0, 64)
      : "Imported";
  return {
    name,
    ...(typeof obj.basedOn === "string" && obj.basedOn.trim()
      ? { basedOn: obj.basedOn.trim().slice(0, 64) }
      : {}),
    theme,
  };
}

/** 组装导出信封。 */
export function toCustomThemeExport(record: CustomThemeRecord): CustomThemeExport {
  return {
    format: CUSTOM_THEME_FORMAT,
    name: record.name,
    ...(record.basedOn ? { basedOn: record.basedOn } : {}),
    theme: { ...record.theme, id: record.id, ui: { ...record.theme.ui }, markdown: { ...record.theme.markdown }, mermaid: { ...record.theme.mermaid, themeVariables: { ...record.theme.mermaid.themeVariables } } },
  };
}
