/**
 * 两步首次引导：① UI / AI 语言 + 根目录 ② 主题与字型。
 *
 * 选择过程中即时预览外观与语言；完成或跳过时写入通用设置并标记 `onboardingCompleted`。
 * 根目录（dataDir）不走 setGeneral，须经 applyDataDirChange。
 */
import { useId, useMemo, useState } from "react";
import { Button, Input, Modal, SegmentedControl, Select } from "@thinker-workbench/design/react";
import {
  AI_LOCALES,
  APP_LOCALES,
  APP_TYPE_STYLE_IDS,
  DEFAULT_AI_LOCALE,
  DEFAULT_APP_LOCALE,
  DEFAULT_APP_THEME,
  DEFAULT_APP_TYPE_STYLE,
  type AiLocale,
  type AppLocale,
  type AppThemeId,
  type AppTypeStyle,
} from "@thinker-workbench/shared";
import {
  applyDataDirChange,
  pickDirectory,
  setGeneralSettings,
} from "../../bridge/thinker";
import { useI18n } from "../../i18n/I18nProvider";
import { useAppearance } from "../../theme/AppearanceProvider";
import { ThemePicker } from "../settings/ThemePicker";

type Step = 1 | 2;

type Props = {
  /** 引导完成或跳过并成功持久化后的回调。 */
  onDone: () => void;
};

export function OnboardingModal({ onDone }: Props) {
  const { t, locale, setLocale, applyGeneral } = useI18n();
  const { applyAppearance } = useAppearance();
  const dataDirId = useId();
  const [step, setStep] = useState<Step>(1);
  const [themeId, setThemeId] = useState<AppThemeId>(DEFAULT_APP_THEME);
  const [typeStyle, setTypeStyle] = useState<AppTypeStyle>(DEFAULT_APP_TYPE_STYLE);
  const [uiLocale, setUiLocale] = useState<AppLocale>(locale || DEFAULT_APP_LOCALE);
  const [aiLocale, setAiLocale] = useState<AiLocale>(DEFAULT_AI_LOCALE);
  /** 空字符串 = 默认 `~/.thinker`。 */
  const [dataDirDraft, setDataDirDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canBrowse = Boolean(window.thinker?.settings?.pickDirectory);

  const typeStyleOptions = useMemo(
    () =>
      APP_TYPE_STYLE_IDS.map((style) => ({
        value: style,
        label:
          style === "regular"
            ? t("settings.general.typeStyle.regular")
            : t("settings.general.typeStyle.hand"),
      })),
    [t],
  );

  const localeOptions = useMemo(
    () =>
      APP_LOCALES.map((loc) => ({
        value: loc,
        label: loc === "zh" ? t("settings.general.localeZh") : t("settings.general.localeEn"),
      })),
    [t],
  );

  const aiLocaleOptions = useMemo(
    () =>
      AI_LOCALES.map((loc) => ({
        value: loc,
        label:
          loc === "smart"
            ? t("settings.general.localeSmart")
            : loc === "zh"
              ? t("settings.general.localeZh")
              : t("settings.general.localeEn"),
      })),
    [t],
  );

  /** 选主题并立刻应用到界面。 */
  function pickTheme(id: AppThemeId) {
    setThemeId(id);
    applyAppearance(id, typeStyle);
  }

  /** 选字型并立刻应用。 */
  function pickTypeStyle(style: AppTypeStyle) {
    setTypeStyle(style);
    applyAppearance(themeId, style);
  }

  /** 选 UI 语言：本地状态 + 即时切换 i18n。 */
  function pickUiLocale(next: AppLocale) {
    setUiLocale(next);
    setLocale(next);
  }

  async function browseDataDir() {
    const picked = await pickDirectory({
      title: t("onboarding.dataDirPick"),
      defaultPath: dataDirDraft.trim() || undefined,
    });
    if (picked) setDataDirDraft(picked);
  }

  /**
   * 持久化选择并标记引导完成。
   * @param dataDir 要提交的根目录配置（空 = 默认）；跳过时传空以丢弃草稿。
   */
  async function persist(
    patch: {
      uiTheme: AppThemeId;
      uiTypeStyle: AppTypeStyle;
      uiLocale: AppLocale;
      aiLocale: AiLocale;
    },
    dataDir: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      const configured = dataDir.trim();
      // 非默认根目录须走专用通道（setGeneral 会忽略 dataDir）
      if (configured) {
        const dirResult = await applyDataDirChange({ dataDir: configured, migrate: false });
        if (!dirResult.ok) {
          setError(dirResult.error ?? t("settings.general.dataDir.progressError"));
          return;
        }
      }

      const saved = await setGeneralSettings({
        ...patch,
        onboardingCompleted: true,
      });
      applyAppearance(saved.uiTheme, saved.uiTypeStyle, saved.customThemes);
      applyGeneral(saved);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  /** 跳过：恢复默认外观/语言/根目录后仍标记完成。 */
  async function skip() {
    applyAppearance(DEFAULT_APP_THEME, DEFAULT_APP_TYPE_STYLE);
    setLocale(DEFAULT_APP_LOCALE);
    await persist(
      {
        uiTheme: DEFAULT_APP_THEME,
        uiTypeStyle: DEFAULT_APP_TYPE_STYLE,
        uiLocale: DEFAULT_APP_LOCALE,
        aiLocale: DEFAULT_AI_LOCALE,
      },
      "",
    );
  }

  /** 完成：保存当前向导选择（含根目录草稿）。 */
  async function finish() {
    await persist({ uiTheme: themeId, uiTypeStyle: typeStyle, uiLocale, aiLocale }, dataDirDraft);
  }

  return (
    <Modal open aria-labelledby="onboarding-title">
      <header className="onboarding-head">
        <p className="onboarding-kicker">
          {t("onboarding.stepOf", { current: String(step), total: "2" })}
        </p>
        <h1 id="onboarding-title">{t("onboarding.title")}</h1>
        <p className="onboarding-lead">
          {step === 1 ? t("onboarding.languageLead") : t("onboarding.appearanceLead")}
        </p>
      </header>

      {step === 1 ? (
        <div className="onboarding-body">
          <div className="onboarding-row">
            <div className="onboarding-row-copy">
              <strong>{t("settings.general.uiLocale.title")}</strong>
              <span>{t("settings.general.uiLocale.description")}</span>
            </div>
            <Select
              className="settings-locale-select"
              value={uiLocale}
              options={localeOptions}
              aria-label={t("settings.general.uiLocale.title")}
              onChange={(loc) => pickUiLocale(loc as AppLocale)}
            />
          </div>
          <div className="onboarding-row">
            <div className="onboarding-row-copy">
              <strong>{t("settings.general.aiLocale.title")}</strong>
              <span>{t("settings.general.aiLocale.description")}</span>
            </div>
            <Select
              className="settings-locale-select"
              value={aiLocale}
              options={aiLocaleOptions}
              aria-label={t("settings.general.aiLocale.title")}
              onChange={(loc) => setAiLocale(loc as AiLocale)}
            />
          </div>
          <div className="onboarding-row onboarding-row--stack">
            <div className="onboarding-row-copy">
              <strong>{t("onboarding.dataDirTitle")}</strong>
              <span>{t("onboarding.dataDirDescription")}</span>
            </div>
            <div className="onboarding-path-row">
              <Input
                id={dataDirId}
                value={dataDirDraft}
                placeholder={t("settings.general.dataDir.placeholder")}
                onChange={(e) => setDataDirDraft(e.target.value)}
                disabled={busy}
                aria-label={t("onboarding.dataDirTitle")}
              />
              {canBrowse ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void browseDataDir()}
                >
                  {t("settings.general.browse")}
                </Button>
              ) : null}
              {dataDirDraft.trim() ? (
                <Button
                  size="sm"
                  variant="text"
                  disabled={busy}
                  onClick={() => setDataDirDraft("")}
                >
                  {t("settings.general.useDefault")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="onboarding-body">
          <ThemePicker
            savedTheme={themeId}
            typeStyle={typeStyle}
            showIntro={false}
            allowCustom={false}
            onSelect={(id) => {
              pickTheme(id);
              return true;
            }}
          />

          <div className="onboarding-row">
            <div className="onboarding-row-copy">
              <strong>{t("onboarding.typeStyleTitle")}</strong>
            </div>
            <SegmentedControl
              value={typeStyle}
              options={typeStyleOptions}
              aria-label={t("onboarding.typeStyleTitle")}
              onChange={(style) => pickTypeStyle(style as AppTypeStyle)}
            />
          </div>
        </div>
      )}

      {error ? <p className="onboarding-err">{error}</p> : null}

      <footer className="onboarding-actions">
        <div className="onboarding-actions-main">
          <Button variant="ghost" disabled={busy} onClick={() => void skip()}>
            {busy ? t("onboarding.saving") : t("onboarding.skip")}
          </Button>
          {step === 2 ? (
            <Button variant="secondary" disabled={busy} onClick={() => setStep(1)}>
              {t("onboarding.back")}
            </Button>
          ) : null}
          {step === 1 ? (
            <Button variant="primary" disabled={busy} onClick={() => setStep(2)}>
              {t("onboarding.next")}
            </Button>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => void finish()}>
              {busy ? t("onboarding.saving") : t("onboarding.finish")}
            </Button>
          )}
        </div>
      </footer>
    </Modal>
  );
}
