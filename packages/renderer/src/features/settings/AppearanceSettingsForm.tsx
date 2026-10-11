/**
 * 设置 →外观：主题、字体大小、UI/AI 语言。
 */
import { SegmentedControl, Select } from "@thinker-workbench/design/react";
import {
  AI_LOCALES,
  APP_FONT_SCALE_IDS,
  APP_LOCALES,
  type AiLocale,
  type AppFontScale,
} from "@thinker-workbench/shared";
import { useMemo } from "react";
import { useI18n } from "../../i18n/useI18n";
import { applyUiFontScale } from "../../theme/fontScale";
import { ThemePicker } from "./ThemePicker";
import { aiLocaleLabel, localeLabel } from "./generalLabels";
import { useGeneralSettings } from "./useGeneralSettings";

type Props = {
  /** 当前分区是否可见；不可见时不从磁盘重载。 */
  active?: boolean;
};

export function AppearanceSettingsForm({ active = true }: Props) {
  const { t } = useI18n();
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

  const fontScaleOptions = useMemo(
    () =>
      APP_FONT_SCALE_IDS.map((id) => ({
        value: id,
        label: t(`settings.general.uiFontScale.${id}`),
      })),
    [t],
  );

  if (!available) {
    return (
      <p className="settings-note">{t("settings.general.unavailable", { cmd: "pnpm run dev" })}</p>
    );
  }

  return (
    <div className="settings-general">
      <ThemePicker
        savedTheme={general.uiTheme}
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
            <strong>{t("settings.general.uiFontScale.title")}</strong>
            <span>{t("settings.general.uiFontScale.description")}</span>
          </div>
          <SegmentedControl
            className="settings-font-scale"
            value={general.uiFontScale}
            options={fontScaleOptions}
            aria-label={t("settings.general.uiFontScale.title")}
            onChange={(value) => {
              const uiFontScale = value as AppFontScale;
              applyUiFontScale(uiFontScale);
              void patchGeneral({ uiFontScale });
            }}
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
