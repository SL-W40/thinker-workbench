/**
 * URL hash ↔ 应用路由位置。
 *
 * 约定：`#/chat`、`#/components`、`#/tools`、`#/tools/<tab>`、`#/tools/settings/<section>`。
 * 旧 `#/settings/<section>` 解析为控制台 Settings 分区。
 * 写入使用 `location.replace`，避免堆浏览器历史，并便于 Electron 持久化 session URL。
 */
import type { PageId } from "./usePageStack";
import {
  DEFAULT_SETTINGS_SECTION,
  isSettingsSection,
  type SettingsSectionId,
} from "../settings/sections";
import { isToolTabId, type ToolTabId } from "../tools/ToolsPane";

/** 解析后的应用位置：当前页 + 控制台 tab + 设置分区。 */
export type AppLocation = {
  page: PageId;
  tab: ToolTabId;
  section: SettingsSectionId;
};

const PAGE_IDS: PageId[] = ["chat", "settings", "components", "tools"];

/**
 * 解析 hash 字符串为页面、控制台 tab 与设置分区；非法页回退为 chat。
 * `#/settings/...` 映射到 `#/tools` + settings tab（设置已并入控制台）。
 */
export function parseHash(raw: string = location.hash): AppLocation {
  const path = raw.replace(/^#\/?/, "").trim();
  const parts = path.split("/").filter(Boolean);
  const pageRaw = parts[0];
  const page = PAGE_IDS.includes(pageRaw as PageId) ? (pageRaw as PageId) : "chat";

  if (page === "settings") {
    const section = isSettingsSection(parts[1]) ? parts[1] : DEFAULT_SETTINGS_SECTION;
    return { page: "tools", tab: "settings", section };
  }

  if (page === "tools") {
    const tabRaw = parts[1];
    if (tabRaw === "settings") {
      const section = isSettingsSection(parts[2]) ? parts[2] : DEFAULT_SETTINGS_SECTION;
      return { page: "tools", tab: "settings", section };
    }
    if (isToolTabId(tabRaw)) {
      return { page: "tools", tab: tabRaw, section: DEFAULT_SETTINGS_SECTION };
    }
    return { page: "tools", tab: "settings", section: DEFAULT_SETTINGS_SECTION };
  }

  return { page, tab: "settings", section: DEFAULT_SETTINGS_SECTION };
}

/**
 * 为当前视图写入 hash。
 * 使用 `location.replace`（而非 push），以便 Electron 把 URL 写入
 * `~/.thinker/session.json` 时不会膨胀浏览器历史。
 */
export function writeHash(
  page: PageId,
  section: SettingsSectionId = DEFAULT_SETTINGS_SECTION,
  tab: ToolTabId = "settings",
): void {
  let next: string;
  if (page === "chat") {
    next = "#/chat";
  } else if (page === "tools" || page === "settings") {
    next =
      tab === "settings" ? `#/tools/settings/${section}` : `#/tools/${tab}`;
  } else {
    next = `#/${page}`;
  }
  if (location.hash === next) return;
  location.replace(`${location.pathname}${location.search}${next}`);
}

/**
 * 解析并规范化当前 hash（非法值写回合法形式），返回位置。
 */
export function ensureHash(): AppLocation {
  const loc = parseHash();
  writeHash(loc.page, loc.section, loc.tab);
  return loc;
}
