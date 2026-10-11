/**
 * 设置 →外观：主题〝字型〝UI/AI 语言。 */
import { SegmentedControl, Select } from "@thinker-workbench/design/react";
import {
  AI_LOCALES,
  APP_LOCALES,
  APP_TYPE_STYLE_IDS,
  type AiLocale,
  type AppTypeStyle,
} from "@thinker-workbench/shared";
import { useMemo } from "react";
import { useI18n } from "../../i18n/useI18n";
import { useAppearance } from "../../theme/useAppearance";
import { ThemePicker } from "./ThemePicker";
import { aiLocaleLabel, localeLabel, typeStyleLabel } from "./generalLabels";
import { useGeneralSettings } from "./useGeneralSettings";

type Props = {
  /** 当剝分区是坦坯觝；坯觝时从磝盘針载。*/
  active?: boolean;
};

export function AppearanceSettingsForm({ active = true }: Props) {
  const { t } = useI18n();
  const { applyAppearance } = useAppearance();
  const { available, general, error, patchGeneral } = useGeneralSettings(active);

  const localeOptions = useMemo(
    () =>
      APP_LOCALES.map((locale) => ({
        value: locale,
        label: localeLabel(locale, t),
      })),
    [t],
  );

  const aiLocaleOptions = useMemo(
    () =>
      AI_LOCALES.map((locale) => ({
        value: locale,
        label: aiLocaleLabel(locale, t),
      })),
    [t],
  );

  const typeStyleOptions = useMemo(
    () =>
      APP_TYPE_STYLE_IDS.map((style) => ({
        value: style,
        label: typeStyleLabel(style, t),
      })),
    [t],
  );

  async function chooseTypeStyle(uiTypeStyle: AppTypeStyle) {
    if (uiTypeStyle === general.uiTypeStyle) return;
    const previous = general.uiTypeStyle;
    applyAppearance(general.uiTheme, uiTypeStyle, general.customThemes);
    const ok = await patchGeneral({ uiTypeStyle });
    if (!ok) applyAppearance(general.uiTheme, previous, general.customThemes);
  }

  if (!available) {
    return (
      <p className="settings-note">{t("settings.general.unavailable", { cmd: "pnpm run dev" })}</p>
    );
  }

  return (
    <div className="settings-general">
      <ThemePicker
        savedTheme={general.uiTheme}
        typeStyle={general.uiTypeStyle}
        customThemes={general.customThemes}
        onSelect={(uiTheme) => patchGeneral({ uiTheme })}
        onCustomThemesChange={(customThemes, selectId) =>
          patchGeneral({
            customThemes,
            ...(selectId ? { uiTheme: selectId } : {}),
          })
        }
      />
      <ul className="settings-toggle-list">
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.typeStyle.title")}</strong>
            <span>{t("settings.general.typeStyle.description")}</span>
          </div>
          <SegmentedControl
            className="settings-type-style"
            value={general.uiTypeStyle}
            options={typeStyleOptions}
            aria-label={t("settings.general.typeStyle.title")}
            onChange={(uiTypeStyle) => void chooseTypeStyle(uiTypeStyle as AppTypeStyle)}
          />
        </li>
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.uiLocale.title")}</strong>
            <span>{t("settings.general.uiLocale.description")}</span>
          </div>
          <Select
            className="settings-locale-select"
            value={general.uiLocale}
            options={localeOptions}
            aria-label={t("settings.general.uiLocale.title")}
            onChange={(uiLocale) => void patchGeneral({ uiLocale })}
          />
        </li>
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.aiLocale.title")}</strong>
            <span>{t("settings.general.aiLocale.description")}</span>
          </div>
          <Select
            className="settings-locale-select"
            value={general.aiLocale}
            options={aiLocaleOptions}
            aria-label={t("settings.general.aiLocale.title")}
            onChange={(aiLocale) => void patchGeneral({ aiLocale: aiLocale as AiLocale })}
          />
        </li>
      </ul>
      {error ? <p className="settings-err">{error}</p> : null}
    </div>
  );
}
