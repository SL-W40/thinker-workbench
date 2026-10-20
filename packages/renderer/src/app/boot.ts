/**
 * 应用启动导航：窗口角色 / 工具嵌入判定 / 初始页面栈读取。
 */
import type { PageStackSnapshot, WindowRole } from "@thinker-workbench/shared";
import { ensureHash, parseHash } from "../features/nav/locationHash";
import type { PageId } from "../features/nav/usePageStack";
import { normalizeSettingsSection, type SettingsSectionId } from "../features/settings/sections";
import type { ToolTabId } from "../features/tools/ToolsPane";

/** 同步读取本窗口角色；浏览器预览视为主窗。 */
export function readWindowRole(): WindowRole {
  return window.thinker?.window?.getRoleSync?.() ?? { kind: "main" };
}

/** 工具嵌入（`?tool=1`）隐藏产品标题栏，避免双层 chrome。 */
export function isDevToolEmbed(): boolean {
  return new URLSearchParams(location.search).get("tool") === "1";
}

/**
 * 读取启动导航状态：辅助窗固定单页；主窗 session 快照优先，否则用规范化后的 hash。
 */
export function readBoot(role: WindowRole): {
  stack: PageStackSnapshot;
  section: SettingsSectionId;
  toolsTab: ToolTabId;
} {
  const fromHash = ensureHash();
  if (role.kind === "aux") {
    const page = role.page as PageId;
    return {
      stack: {
        entries: [page],
        index: 0,
        visited: [page],
      },
      section: fromHash.section,
      toolsTab: fromHash.tab,
    };
  }
  const saved = window.thinker?.session?.getSnapshot?.() ?? null;
  if (saved?.stack?.entries?.length) {
    // 优先用 session 里的 hash 恢复控制台 tab / 设置分区（勿只用 location，HMR 时可能不准）
    const fromSaved = saved.hash ? parseHash(saved.hash) : fromHash;
    const section = normalizeSettingsSection(
      saved.settingsSection ?? fromSaved.section ?? fromHash.section,
    );
    const entries = saved.stack.entries as PageId[];
    const visited = (saved.stack.visited ?? entries) as PageId[];
    const current = (entries[saved.stack.index] ?? fromSaved.page ?? fromHash.page) as PageId;
    const onTools = current === "tools";
    return {
      stack: {
        ...saved.stack,
        entries,
        visited,
      },
      section,
      toolsTab: onTools ? fromSaved.tab : "settings",
    };
  }
  return {
    stack: {
      entries: [fromHash.page],
      index: 0,
      visited: [fromHash.page],
    },
    section: fromHash.section,
    toolsTab: fromHash.tab,
  };
}
