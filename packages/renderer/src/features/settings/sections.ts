/**
 * 设置页侧栏分区元数据：分组、id、标题/描述的 i18n 键。
 * 与 URL `#/tools/settings/<id>`（及旧 `#/settings/<id>`）及 session 中的 `settingsSection` 对齐。
 * 旧 MCP 分区已迁至控制台 Customize（`#/tools/customize`）。
 */
import type { MessageKey } from "../../i18n/translate";

export type SettingsSectionId =
  | "appearance"
  | "notifications"
  | "data"
  | "permissions"
  | "agentLimits"
  | "browser"
  | "model"
  | "shortcuts";

export type SettingsSection = {
  id: SettingsSectionId;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
};

/** 侧栏分组：标题 + 叶子分区。 */
export type SettingsNavGroup = {
  id: string;
  labelKey: MessageKey;
  items: SettingsSection[];
};

/** 默认打开的设置分区。 */
export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = "appearance";

const APPEARANCE: SettingsSection = {
  id: "appearance",
  titleKey: "settings.sections.appearance.title",
  descriptionKey: "settings.sections.appearance.description",
};

const NOTIFICATIONS: SettingsSection = {
  id: "notifications",
  titleKey: "settings.sections.notifications.title",
  descriptionKey: "settings.sections.notifications.description",
};

const DATA: SettingsSection = {
  id: "data",
  titleKey: "settings.sections.data.title",
  descriptionKey: "settings.sections.data.description",
};

const PERMISSIONS: SettingsSection = {
  id: "permissions",
  titleKey: "settings.sections.permissions.title",
  descriptionKey: "settings.sections.permissions.description",
};

const AGENT_LIMITS: SettingsSection = {
  id: "agentLimits",
  titleKey: "settings.sections.agentLimits.title",
  descriptionKey: "settings.sections.agentLimits.description",
};

const BROWSER: SettingsSection = {
  id: "browser",
  titleKey: "settings.sections.browser.title",
  descriptionKey: "settings.sections.browser.description",
};

const MODEL: SettingsSection = {
  id: "model",
  titleKey: "settings.sections.model.title",
  descriptionKey: "settings.sections.model.description",
};

const SHORTCUTS: SettingsSection = {
  id: "shortcuts",
  titleKey: "settings.sections.shortcuts.title",
  descriptionKey: "settings.sections.shortcuts.description",
};

/** 侧栏分组顺序。 */
export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    id: "app",
    labelKey: "settings.nav.groups.app",
    items: [APPEARANCE, NOTIFICATIONS, DATA],
  },
  {
    id: "agent",
    labelKey: "settings.nav.groups.agent",
    items: [PERMISSIONS, AGENT_LIMITS, BROWSER, MODEL, SHORTCUTS],
  },
];

/** 扁平分区列表（查找 / 默认项）。 */
export const SETTINGS_SECTIONS: SettingsSection[] = SETTINGS_NAV_GROUPS.flatMap((g) => g.items);

/** 类型守卫：字符串是否为合法设置分区 id（不含已废弃的 general / mcp）。 */
export function isSettingsSection(value: string | undefined): value is SettingsSectionId {
  return (
    value === "appearance" ||
    value === "notifications" ||
    value === "data" ||
    value === "permissions" ||
    value === "agentLimits" ||
    value === "browser" ||
    value === "model" ||
    value === "shortcuts"
  );
}

/**
 * 规范化分区 id：旧 `general` → `appearance`；旧 `mcp` 与非法值回退默认
 * （MCP 路由重定向见 locationHash）。
 */
export function normalizeSettingsSection(value: string | undefined): SettingsSectionId {
  if (value === "general") return "appearance";
  if (isSettingsSection(value)) return value;
  return DEFAULT_SETTINGS_SECTION;
}
