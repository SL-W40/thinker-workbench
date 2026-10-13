/**
 * 设置页外壳：左侧分组 SideNav 切换分区，右侧渲染对应表单。 * 侧栏随窗口宽度伸缩；窄时收成仅图标（container query）。 * 快捷键分区自带标题行；其它分区用统一 header + 表单 / EmptyState。 */
import {
  AgentModeIcon,
  BellIcon,
  CubeIcon,
  DatabaseIcon,
  EmptyState,
  GlobeIcon,
  type IconProps,
  KeyboardIcon,
  PaletteIcon,
  Separator,
  ShieldIcon,
  SideNavItem,
} from "@thinker-workbench/design/react";
import type { ComponentType } from "react";
import { useT } from "../../i18n/useI18n";
import { AgentLimitsSettingsForm } from "./AgentLimitsSettingsForm";
import { AppearanceSettingsForm } from "./AppearanceSettingsForm";
import { BrowserNetworkSettingsForm } from "./BrowserNetworkSettingsForm";
import { DataSettingsForm } from "./DataSettingsForm";
import { ModelSettingsForm } from "./ModelSettingsForm";
import { NotificationsSettingsForm } from "./NotificationsSettingsForm";
import { PermissionsSettingsForm } from "./PermissionsSettingsForm";
import { ShortcutsSettingsForm } from "./ShortcutsSettingsForm";
import { SETTINGS_NAV_GROUPS, SETTINGS_SECTIONS, type SettingsSectionId } from "./sections";

type Props = {
  /** 当前是否为可见的设置页（否则 CSS hidden，仍可保活）。*/
  active: boolean;
  section: SettingsSectionId;
  onSectionChange: (section: SettingsSectionId) => void;
};

/** 各设置分区侧栏图标。*/
const SECTION_ICONS: Record<SettingsSectionId, ComponentType<IconProps>> = {
  appearance: PaletteIcon,
  notifications: BellIcon,
  data: DatabaseIcon,
  permissions: ShieldIcon,
  agentLimits: AgentModeIcon,
  browser: GlobeIcon,
  model: CubeIcon,
  shortcuts: KeyboardIcon,
};

export function SettingsPane({ active, section, onSectionChange }: Props) {
  const t = useT();
  const current = SETTINGS_SECTIONS.find((item) => item.id === section) ?? SETTINGS_SECTIONS[0]!;

  return (
    <div className="settings-shell" hidden={!active}>
      <aside className="settings-nav" aria-label={t("settings.navLabel")}>
        <nav className="settings-menu">
          {SETTINGS_NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.id} className="settings-nav-group">
              {groupIndex > 0 ? <Separator className="settings-nav-group-sep" /> : null}
              <div className="settings-nav-group-items">
                {group.items.map((item) => {
                  const Icon = SECTION_ICONS[item.id];
                  const label = t(item.titleKey);
                  return (
                    <SideNavItem
                      key={item.id}
                      selected={item.id === section}
                      leading={<Icon size="md" aria-hidden />}
                      title={label}
                      onClick={() => onSectionChange(item.id)}
                    >
                      {label}
                    </SideNavItem>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <section className="settings-content">
        {section === "shortcuts" ? (
          <ShortcutsSettingsForm
            title={t(current.titleKey)}
            description={t(current.descriptionKey)}
          />
        ) : (
          <>
            <header className="settings-header">
              <h1>{t(current.titleKey)}</h1>
              <p>{t(current.descriptionKey)}</p>
            </header>
            {section === "appearance" ? (
              <AppearanceSettingsForm active={active} />
            ) : section === "notifications" ? (
              <NotificationsSettingsForm active={active} />
            ) : section === "data" ? (
              <DataSettingsForm active={active} />
            ) : section === "permissions" ? (
              <PermissionsSettingsForm active={active} />
            ) : section === "agentLimits" ? (
              <AgentLimitsSettingsForm active={active} />
            ) : section === "browser" ? (
              <BrowserNetworkSettingsForm active={active} />
            ) : section === "model" ? (
              <ModelSettingsForm />
            ) : (
              <EmptyState title={t("settings.empty")} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
