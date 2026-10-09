/**
 * 产品控制台内容区：Settings / Logs / Components。
 * UI 来自设置页、`@thinker-workbench/logger-web` 与组件预览；顶部 tab 在 TitleBar。
 */
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import {
  ConsoleIcon,
  GridIcon,
  LogsIcon,
  SettingsIcon,
  Spinner,
} from "@thinker-workbench/design/react";
import { useI18n, useT } from "../../i18n/I18nProvider";
import type { Locale as LogsLocale } from "@thinker-workbench/logger-web/i18n";
import { SettingsPane } from "../settings/SettingsPane";
import type { SettingsSectionId } from "../settings/sections";
import "./tools.less";

const LogsApp = lazy(async () => {
  await import("@thinker-workbench/logger-web/styles.less");
  const m = await import("@thinker-workbench/logger-web/App");
  return { default: m.App };
});

const ComponentsPane = lazy(async () => {
  const m = await import("../components/ComponentsPane");
  return { default: m.ComponentsPane };
});

export type ToolTabId = "settings" | "logs" | "components";

export const TOOL_TAB_IDS: ToolTabId[] = ["settings", "logs", "components"];

/** 是否为合法控制台 tab。 */
export function isToolTabId(value: unknown): value is ToolTabId {
  return typeof value === "string" && (TOOL_TAB_IDS as readonly string[]).includes(value);
}

type ToolsPaneProps = {
  active: boolean;
  tab: ToolTabId;
  visited: ReadonlySet<ToolTabId>;
  settingsSection: SettingsSectionId;
  onSettingsSectionChange: (section: SettingsSectionId) => void;
  /** 从聊天 Trace 胶囊跳转时要筛选的追踪 id。 */
  logsFocusTraceId?: string | null;
  /** 与 logsFocusTraceId 配对；同 id 再次跳转时递增以触发筛选。 */
  logsFocusSeq?: number;
};

/** 产品控制台主体（tab 切换由 TitleBar 控制）。 */
export function ToolsPane({
  active,
  tab,
  visited,
  settingsSection,
  onSettingsSectionChange,
  logsFocusTraceId = null,
  logsFocusSeq = 0,
}: ToolsPaneProps) {
  const t = useT();
  const { locale } = useI18n();

  useEffect(() => {
    if (!active) return;
    window.__TW_EMBED_HOST__ = true;
  }, [active]);

  return (
    <div className="tools-shell" hidden={!active}>
      <div className="tools-body">
        <Suspense
          fallback={
            <div className="tools-loading">
              <Spinner size="md" label={t("tools.loading")} />
            </div>
          }
        >
          {visited.has("settings") ? (
            <div className="tools-embed is-settings" hidden={tab !== "settings"}>
              <SettingsPane
                active={active && tab === "settings"}
                section={settingsSection}
                onSectionChange={onSettingsSectionChange}
              />
            </div>
          ) : null}
          {visited.has("logs") ? (
            <div className="tools-embed is-logs" hidden={tab !== "logs"}>
              <LogsApp
                hostLocale={locale as LogsLocale}
                focusTraceId={logsFocusTraceId}
                focusSeq={logsFocusSeq}
              />
            </div>
          ) : null}
          {visited.has("components") ? (
            <div className="tools-embed is-components" hidden={tab !== "components"}>
              <ComponentsPane active={tab === "components"} />
            </div>
          ) : null}
        </Suspense>
      </div>
    </div>
  );
}

export function toolTabLabel(
  t: (key: "tools.settings" | "tools.logs" | "tools.components") => string,
  id: ToolTabId,
): string {
  if (id === "settings") return t("tools.settings");
  if (id === "logs") return t("tools.logs");
  return t("tools.components");
}

export function toolTabIcon(id: ToolTabId): ReactNode {
  if (id === "settings") return <SettingsIcon />;
  if (id === "logs") return <LogsIcon />;
  if (id === "components") return <GridIcon />;
  return <ConsoleIcon />;
}
