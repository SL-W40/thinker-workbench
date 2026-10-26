/**
 * 设置 →外观：主题、字体大小、UI/AI 语言。
 */
import { Select, Slider } from "@thinker-workbench/design/react";
import {
  AI_LOCALES,
  type AiLocale,
  APP_FONT_SCALE_MAX,
  APP_FONT_SCALE_MIN,
  APP_FONT_SCALE_STEP,
  APP_LOCALES,
  normalizeAppFontScale,
} from "@thinker-workbench/shared";
import { useMemo } from "react";
import { applyUiFontScale } from "../../platform/appearance/fontScale";
import { useI18n } from "../../ui/i18n/useI18n";
import { aiLocaleLabel, localeLabel } from "./generalLabels";
import { ThemePicker } from "./ThemePicker";
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

  /** 可选档位数：(max - min) / step + 1，用于滑块刻度点。 */
  const fontScaleTicks =
    Math.round((APP_FONT_SCALE_MAX - APP_FONT_SCALE_MIN) / APP_FONT_SCALE_STEP) + 1;

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
        <li className="settings-toggle-row settings-toggle-row--stack">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.uiFontScale.title")}</strong>
            <span>{t("settings.general.uiFontScale.description")}</span>
          </div>
          <Slider
            className="settings-font-scale"
            value={general.uiFontScale}
            min={APP_FONT_SCALE_MIN}
            max={APP_FONT_SCALE_MAX}
            step={APP_FONT_SCALE_STEP}
            ticks={fontScaleTicks}
            valueText={`${Math.round(general.uiFontScale * 100)}%`}
            aria-label={t("settings.general.uiFontScale.title")}
            onChange={(value) => {
              const uiFontScale = normalizeAppFontScale(value);
              // 拖动即时预览：zoom 直接落到 <html>，不等 IPC 往返
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
