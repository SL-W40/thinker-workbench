/**
 * 两步首次引导：① UI / AI 语言 + 根目录；② 主题。
 *
 * 选择过程中即时预览外观与语言；完成或跳过时写入通用设置并标记 `onboardingCompleted`。
 * 根目录（dataDir）不走 setGeneral，须经 applyDataDirChange。
 */

import { Button, Input, Modal, Select } from "@thinker-workbench/design/react";
import {
  AI_LOCALES,
  type AiLocale,
  APP_LOCALES,
  type AppLocale,
  type AppThemeId,
  DEFAULT_AI_LOCALE,
  DEFAULT_APP_LOCALE,
  DEFAULT_APP_THEME,
} from "@thinker-workbench/shared";
import { useId, useMemo, useState } from "react";
import { useAppearance } from "../../platform/appearance/useAppearance";
import { applyDataDirChange, pickDirectory, setGeneralSettings } from "../../platform/ipc/thinker";
import { useI18n } from "../../ui/i18n/useI18n";
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
  const [uiLocale, setUiLocale] = useState<AppLocale>(locale || DEFAULT_APP_LOCALE);
  const [aiLocale, setAiLocale] = useState<AiLocale>(DEFAULT_AI_LOCALE);
  /** 空字符串 = 默认 `~/.thinker`。 */
  const [dataDirDraft, setDataDirDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canBrowse = Boolean(window.thinker?.settings?.pickDirectory);

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
    applyAppearance(id);
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
      applyAppearance(saved.uiTheme, saved.customThemes);
      applyGeneral(saved);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  /** 跳过：恢复默认后仍标记完成。 */
  async function skip() {
    applyAppearance(DEFAULT_APP_THEME);
    setLocale(DEFAULT_APP_LOCALE);
    await persist(
      {
        uiTheme: DEFAULT_APP_THEME,
        uiLocale: DEFAULT_APP_LOCALE,
        aiLocale: DEFAULT_AI_LOCALE,
      },
      "",
    );
  }

  /** 完成：保存当前向导选择。 */
  async function finish() {
    await persist({ uiTheme: themeId, uiLocale, aiLocale }, dataDirDraft);
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
            showIntro={false}
            allowCustom={false}
            onSelect={(id) => {
              pickTheme(id);
              return true;
            }}
          />
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
