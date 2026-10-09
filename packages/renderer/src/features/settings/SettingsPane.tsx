/**
 * 设置页外壳：左侧 SideNav 切换分区，右侧渲染对应表单。
 * 快捷键分区自带标题行；其它分区用统一 header + 表单 / EmptyState。
 */
import { EmptyState, SideNavItem } from "@thinker-workbench/design/react";
import { useT } from "../../i18n/I18nProvider";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./sections";
import { GeneralSettingsForm } from "./GeneralSettingsForm";
import { ModelSettingsForm } from "./ModelSettingsForm";
import { ShortcutsSettingsForm } from "./ShortcutsSettingsForm";

type Props = {
  /** 当前是否为可见的设置页（否则 CSS hidden，仍可保活）。 */
  active: boolean;
  section: SettingsSectionId;
  onSectionChange: (section: SettingsSectionId) => void;
};

export function SettingsPane({ active, section, onSectionChange }: Props) {
  const t = useT();
  const current = SETTINGS_SECTIONS.find((item) => item.id === section) ?? SETTINGS_SECTIONS[0]!;

  return (
    <div className="settings-shell" hidden={!active}>
      <aside className="settings-nav" aria-label={t("settings.navLabel")}>
        <p className="settings-nav-title">{t("settings.title")}</p>
        <nav className="settings-menu">
          {SETTINGS_SECTIONS.map((item) => (
            <SideNavItem
              key={item.id}
              selected={item.id === section}
              onClick={() => onSectionChange(item.id)}
            >
              {t(item.titleKey)}
            </SideNavItem>
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
            {section === "model" ? (
              <ModelSettingsForm />
            ) : section === "general" ? (
              <GeneralSettingsForm active={active} />
            ) : (
              <EmptyState title={t("settings.empty")} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
