/**
 * 产品控制台内容区：Settings / Customize / Trace / Components。
 */

import {
  CodeIcon,
  ConsoleIcon,
  GridIcon,
  LogsIcon,
  SettingsIcon,
  Spinner,
} from "@thinker-workbench/design/react";
import { lazy, type ReactNode, Suspense } from "react";
import type { MessageKey } from "../../i18n/translate";
import { useT } from "../../i18n/useI18n";
import { SettingsPane } from "../settings/SettingsPane";
import type { SettingsSectionId } from "../settings/sections";
import "./tools.less";

const TracePane = lazy(async () => {
  const m = await import("../trace/TracePane");
  return { default: m.TracePane };
});

const ComponentsPane = lazy(async () => {
  const m = await import("../components/ComponentsPane");
  return { default: m.ComponentsPane };
});

const CustomizePane = lazy(async () => {
  const m = await import("../customize/CustomizePane");
  return { default: m.CustomizePane };
});

/** `logs` 为历史路由键，UI 文案是 Trace。*/
export type ToolTabId = "settings" | "customize" | "logs" | "components";

export const TOOL_TAB_IDS: ToolTabId[] = ["settings", "customize", "logs", "components"];

/** 是否为合法控制台 tab。*/
export function isToolTabId(value: unknown): value is ToolTabId {
  return typeof value === "string" && (TOOL_TAB_IDS as readonly string[]).includes(value);
}

/** 规范化 tab；未知值回退 settings。 */
export function normalizeToolTabId(value: unknown): ToolTabId {
  if (typeof value === "string" && (TOOL_TAB_IDS as readonly string[]).includes(value)) {
    return value as ToolTabId;
  }
  return "settings";
}

type ToolsPaneProps = {
  active: boolean;
  tab: ToolTabId;
  visited: ReadonlySet<ToolTabId>;
  settingsSection: SettingsSectionId;
  onSettingsSectionChange: (section: SettingsSectionId) => void;
  /** 从聊天跳转聚焦会话。*/
  focusSessionId?: string | null;
};

/** 产品控制台主体（tab 切换由 TitleBar 控制）。*/
export function ToolsPane({
  active,
  tab,
  visited,
  settingsSection,
  onSettingsSectionChange,
  focusSessionId = null,
}: ToolsPaneProps) {
  const t = useT();

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
          {visited.has("customize") ? (
            <div className="tools-embed is-customize" hidden={tab !== "customize"}>
              <CustomizePane active={active && tab === "customize"} />
            </div>
          ) : null}
          {visited.has("logs") ? (
            <div className="tools-embed is-logs" hidden={tab !== "logs"}>
              <TracePane active={active && tab === "logs"} focusSessionId={focusSessionId} />
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

const TOOL_TAB_LABEL_KEYS: Record<ToolTabId, MessageKey> = {
  settings: "tools.settings",
  customize: "tools.tabs.customize",
  logs: "tools.tabTrace",
  components: "tools.components",
};

export function toolTabLabel(t: (key: MessageKey) => string, id: ToolTabId): string {
  return t(TOOL_TAB_LABEL_KEYS[id]);
}

export function toolTabIcon(id: ToolTabId): ReactNode {
  if (id === "settings") return <SettingsIcon />;
  if (id === "customize") return <CodeIcon />;
  if (id === "logs") return <LogsIcon />;
  if (id === "components") return <GridIcon />;
  return <ConsoleIcon />;
}
