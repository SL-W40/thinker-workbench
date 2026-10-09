/**
 * 设置页侧栏分区元数据：id、标题/描述的 i18n 键。
 * 与 URL `#/tools/settings/<id>`（及旧 `#/settings/<id>`）及 session 中的 `settingsSection` 对齐。
 */
import type { MessageKey } from "../../i18n/translate";

export type SettingsSectionId = "general" | "model" | "mcp" | "shortcuts";

export type SettingsSection = {
  id: SettingsSectionId;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
};

/** 默认打开的设置分区。 */
export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = "general";

/** 侧栏菜单顺序与文案键。 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "general",
    titleKey: "settings.sections.general.title",
    descriptionKey: "settings.sections.general.description",
  },
  {
    id: "model",
    titleKey: "settings.sections.model.title",
    descriptionKey: "settings.sections.model.description",
  },
  {
    id: "mcp",
    titleKey: "settings.sections.mcp.title",
    descriptionKey: "settings.sections.mcp.description",
  },
  {
    id: "shortcuts",
    titleKey: "settings.sections.shortcuts.title",
    descriptionKey: "settings.sections.shortcuts.description",
  },
];

/** 类型守卫：字符串是否为合法设置分区 id。 */
export function isSettingsSection(value: string | undefined): value is SettingsSectionId {
  return (
    value === "general" || value === "model" || value === "mcp" || value === "shortcuts"
  );
}
