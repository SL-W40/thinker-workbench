/**
 * 设置 → 通用：主题、字型、UI/AI 语言、工作区访问、AI 删文件与恢复缓存、通知/托盘/完成音、数据目录与日志策略。
 *
 * - 面板变为 `active` 时从磁盘重载
 * - 监听 `GENERAL_SETTINGS_CHANGED` 与其它入口（如引导）保持同步
 * - 数据目录仅草稿，须手动保存；保存前确认是否迁移历史数据，迁移时展示进度
 */

import {
  Button,
  Field,
  Input,
  Modal,
  Progress,
  SegmentedControl,
  Select,
  Switch,
} from "@thinker-workbench/design/react";
import {
  AI_LOCALES,
  APP_LOCALES,
  APP_TYPE_STYLE_IDS,
  DELETE_FILE_RESTORE_TTL_DAY_OPTIONS,
  LOG_RETENTION_DAY_OPTIONS,
  WORKSPACE_ACCESS_OPTIONS,
  type AiLocale,
  type AppLocale,
  type AppTypeStyle,
  type AttentionPreviewKind,
  type DataDirChangePreview,
  type DataDirMigrateProgress,
  DEFAULT_GENERAL_SETTINGS,
  type GeneralSettings,
  type WorkspaceAccess,
} from "@thinker-workbench/shared";
import { useEffect, useId, useMemo, useState } from "react";
import {
  applyDataDirChange,
  GENERAL_SETTINGS_CHANGED,
  getGeneralSettings,
  onDataDirMigrateProgress,
  pickDirectory,
  previewAttention,
  previewDataDirChange,
  setGeneralSettings,
} from "../../bridge/thinker";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/translate";
import { useAppearance } from "../../theme/AppearanceProvider";
import { ThemePicker } from "./ThemePicker";

type Props = {
  /** 设置 → 通用分区是否正在显示；显示时从磁盘重载。 */
  active?: boolean;
};

type ToggleId =
  | "systemNotifications"
  | "systemTrayIcon"
  | "completionSound"
  | "loggingEnabled"
  | "logTruncateLongContent";

/** 布尔开关行配置（含可选注意力预览类型）。 */
const TOGGLES: Array<{
  id: ToggleId;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  preview?: AttentionPreviewKind;
}> = [
  {
    id: "systemNotifications",
    titleKey: "settings.general.systemNotifications.title",
    descriptionKey: "settings.general.systemNotifications.description",
    preview: "notification",
  },
  {
    id: "systemTrayIcon",
    titleKey: "settings.general.systemTrayIcon.title",
    descriptionKey: "settings.general.systemTrayIcon.description",
  },
  {
    id: "completionSound",
    titleKey: "settings.general.completionSound.title",
    descriptionKey: "settings.general.completionSound.description",
    preview: "sound",
  },
];

/** 日志相关开关（放在存储区块内）。 */
const LOG_TOGGLES: Array<{
  id: ToggleId;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
}> = [
  {
    id: "loggingEnabled",
    titleKey: "settings.general.loggingEnabled.title",
    descriptionKey: "settings.general.loggingEnabled.description",
  },
  {
    id: "logTruncateLongContent",
    titleKey: "settings.general.logTruncateLongContent.title",
    descriptionKey: "settings.general.logTruncateLongContent.description",
  },
];

function retentionLabel(days: number, t: (key: MessageKey) => string): string {
  if (days <= 0) return t("settings.general.logRetention.never");
  return t("settings.general.logRetention.days").replace("{n}", String(days));
}

function localeLabel(locale: AppLocale, t: (key: MessageKey) => string): string {
  return locale === "zh" ? t("settings.general.localeZh") : t("settings.general.localeEn");
}

function aiLocaleLabel(locale: AiLocale, t: (key: MessageKey) => string): string {
  if (locale === "smart") return t("settings.general.localeSmart");
  return localeLabel(locale, t);
}

function workspaceAccessLabel(access: WorkspaceAccess, t: (key: MessageKey) => string): string {
  if (access === "workspace") return t("settings.general.workspaceAccess.workspace");
  if (access === "readOutside") return t("settings.general.workspaceAccess.readOutside");
  return t("settings.general.workspaceAccess.full");
}

function deleteRestoreTtlLabel(days: number, t: (key: MessageKey) => string): string {
  if (days <= 0) return t("settings.general.deleteFileRestoreTtl.never");
  return t("settings.general.deleteFileRestoreTtl.days").replace("{n}", String(days));
}

function typeStyleLabel(style: AppTypeStyle, t: (key: MessageKey) => string): string {
  return style === "regular"
    ? t("settings.general.typeStyle.regular")
    : t("settings.general.typeStyle.hand");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function GeneralSettingsForm({ active = true }: Props) {
  const { t, applyGeneral } = useI18n();
  const { applyAppearance } = useAppearance();
  const [general, setGeneral] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [dataDirDraft, setDataDirDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState<AttentionPreviewKind | null>(null);
  const [dataDirBusy, setDataDirBusy] = useState(false);
  const [migratePreview, setMigratePreview] = useState<DataDirChangePreview | null>(null);
  const [migrateProgress, setMigrateProgress] = useState<DataDirMigrateProgress | null>(null);
  const available = Boolean(window.thinker?.settings?.getGeneral);
  const dataDirId = useId();
  const canBrowse = Boolean(window.thinker?.settings?.pickDirectory);
  const canApplyDataDir = Boolean(window.thinker?.settings?.applyDataDirChange);

  const dataDirDirty = dataDirDraft.trim() !== general.dataDir.trim();

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

  const workspaceAccessOptions = useMemo(
    () =>
      WORKSPACE_ACCESS_OPTIONS.map((access) => ({
        value: access,
        label: workspaceAccessLabel(access, t),
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

  const retentionOptions = useMemo(() => {
    const days = new Set<number>([...LOG_RETENTION_DAY_OPTIONS, general.logRetentionDays]);
    return [...days]
      .sort((a, b) => a - b)
      .map((value) => ({
        value: String(value),
        label: retentionLabel(value, t),
      }));
  }, [general.logRetentionDays, t]);

  const deleteRestoreTtlOptions = useMemo(() => {
    const days = new Set<number>([
      ...DELETE_FILE_RESTORE_TTL_DAY_OPTIONS,
      general.deleteFileRestoreTtlDays,
    ]);
    // 0（永不）放最后；其余按天升序
    return [...days]
      .sort((a, b) => {
        if (a <= 0 && b <= 0) return 0;
        if (a <= 0) return 1;
        if (b <= 0) return -1;
        return a - b;
      })
      .map((value) => ({
        value: String(value),
        label: deleteRestoreTtlLabel(value, t),
      }));
  }, [general.deleteFileRestoreTtlDays, t]);

  useEffect(() => {
    if (!available || !active) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await getGeneralSettings();
        if (!cancelled) {
          setGeneral(next);
          setDataDirDraft(next.dataDir);
          applyGeneral(next);
          applyAppearance(next.uiTheme, next.uiTypeStyle, next.customThemes);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [available, active, applyGeneral, applyAppearance]);

  useEffect(() => {
    function onChanged(event: Event) {
      const saved = (event as CustomEvent<GeneralSettings>).detail;
      if (!saved) return;
      setGeneral(saved);
      setDataDirDraft(saved.dataDir);
      applyGeneral(saved);
      applyAppearance(saved.uiTheme, saved.uiTypeStyle, saved.customThemes);
      setError(null);
    }
    window.addEventListener(GENERAL_SETTINGS_CHANGED, onChanged);
    return () => window.removeEventListener(GENERAL_SETTINGS_CHANGED, onChanged);
  }, [applyGeneral, applyAppearance]);

  useEffect(() => {
    return onDataDirMigrateProgress((progress) => {
      setMigrateProgress(progress);
    });
  }, []);

  async function patchGeneral(patch: Partial<GeneralSettings>): Promise<boolean> {
    setGeneral((prev) => {
      const next = { ...prev, ...patch };
      if (patch.uiLocale) applyGeneral(next);
      return next;
    });
    try {
      const saved = await setGeneralSettings(patch);
      setGeneral(saved);
      // dataDir 不会被 setGeneral 改写；草稿保持用户编辑
      applyGeneral(saved);
      setError(null);
      return true;
    } catch (err) {
      const next = await getGeneralSettings().catch(() => null);
      if (next) {
        setGeneral(next);
        setDataDirDraft(next.dataDir);
        applyGeneral(next);
        applyAppearance(next.uiTheme, next.uiTypeStyle, next.customThemes);
      }
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async function browseDataDir() {
    const picked = await pickDirectory({
      title: t("settings.general.dataDir.title"),
      defaultPath: dataDirDraft.trim() || undefined,
    });
    if (!picked) return;
    setDataDirDraft(picked);
  }

  /** 打开确认迁移对话框（先预览）。 */
  async function beginSaveDataDir() {
    if (!dataDirDirty || dataDirBusy) return;
    setDataDirBusy(true);
    setError(null);
    try {
      const preview = await previewDataDirChange(dataDirDraft);
      if (!preview.changed) {
        setDataDirDraft(general.dataDir);
        setDataDirBusy(false);
        return;
      }
      if (preview.runningSessionCount > 0) {
        setError(
          t("settings.general.dataDir.runningSessions").replace(
            "{n}",
            String(preview.runningSessionCount),
          ),
        );
        setDataDirBusy(false);
        return;
      }
      setMigratePreview(preview);
      setDataDirBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDataDirBusy(false);
    }
  }

  async function confirmDataDirChange(migrate: boolean) {
    if (!migratePreview) return;
    setDataDirBusy(true);
    setMigrateProgress({
      phase: "preparing",
      done: 0,
      total: 0,
      percent: 0,
    });
    try {
      const result = await applyDataDirChange({
        dataDir: migratePreview.configuredTo,
        migrate,
      });
      if (!result.ok) {
        const code = result.error ?? "unknown";
        if (code.startsWith("running_sessions:")) {
          setError(
            t("settings.general.dataDir.runningSessions").replace(
              "{n}",
              code.split(":")[1] ?? "?",
            ),
          );
        } else if (code === "nested_paths") {
          setError(t("settings.general.dataDir.nestedPaths"));
        } else {
          setError(code);
        }
        setMigratePreview(null);
        setMigrateProgress(null);
        setDataDirBusy(false);
        return;
      }
      if (result.general) {
        setGeneral(result.general);
        setDataDirDraft(result.general.dataDir);
        applyGeneral(result.general);
      }
      setMigratePreview(null);
      setMigrateProgress(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMigratePreview(null);
      setMigrateProgress(null);
    } finally {
      setDataDirBusy(false);
    }
  }

  async function chooseTypeStyle(uiTypeStyle: AppTypeStyle) {
    if (uiTypeStyle === general.uiTypeStyle) return;
    const previous = general.uiTypeStyle;
    applyAppearance(general.uiTheme, uiTypeStyle, general.customThemes);
    const ok = await patchGeneral({ uiTypeStyle });
    if (!ok) applyAppearance(general.uiTheme, previous, general.customThemes);
  }

  async function toggle(id: ToggleId) {
    await patchGeneral({ [id]: !general[id] });
  }

  async function tryPreview(kind: AttentionPreviewKind) {
    if (previewBusy) return;
    setPreviewBusy(kind);
    try {
      await previewAttention(kind);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewBusy(null);
    }
  }

  const migrating = Boolean(migrateProgress && migrateProgress.phase !== "done");

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
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.workspaceAccess.title")}</strong>
            <span>{t("settings.general.workspaceAccess.description")}</span>
          </div>
          <Select
            className="settings-locale-select"
            value={general.workspaceAccess}
            options={workspaceAccessOptions}
            aria-label={t("settings.general.workspaceAccess.title")}
            onChange={(workspaceAccess) =>
              void patchGeneral({ workspaceAccess: workspaceAccess as WorkspaceAccess })
            }
          />
        </li>
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.allowAiDeleteFiles.title")}</strong>
            <span>{t("settings.general.allowAiDeleteFiles.description")}</span>
          </div>
          <Switch
            checked={general.allowAiDeleteFiles}
            aria-label={t("settings.general.allowAiDeleteFiles.title")}
            onChange={(allowAiDeleteFiles) => void patchGeneral({ allowAiDeleteFiles })}
          />
        </li>
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.deleteFileRestoreTtl.title")}</strong>
            <span>{t("settings.general.deleteFileRestoreTtl.description")}</span>
          </div>
          <Select
            className="settings-locale-select"
            value={String(general.deleteFileRestoreTtlDays)}
            options={deleteRestoreTtlOptions}
            aria-label={t("settings.general.deleteFileRestoreTtl.title")}
            onChange={(value) => {
              const days = Number(value);
              if (!Number.isFinite(days)) return;
              void patchGeneral({ deleteFileRestoreTtlDays: days });
            }}
          />
        </li>
        {TOGGLES.map((item) => {
          const on = general[item.id];
          return (
            <li key={item.id} className="settings-toggle-row">
              <div className="settings-toggle-copy">
                <div className="settings-toggle-title">
                  <strong>{t(item.titleKey)}</strong>
                  {item.preview ? (
                    <Button
                      size="sm"
                      variant="text"
                      disabled={previewBusy === item.preview}
                      onClick={() => void tryPreview(item.preview!)}
                    >
                      {previewBusy === item.preview
                        ? t("settings.general.playing")
                        : t("settings.general.tryIt")}
                    </Button>
                  ) : null}
                </div>
                <span>{t(item.descriptionKey)}</span>
              </div>
              <Switch
                checked={on}
                aria-label={t(item.titleKey)}
                onChange={() => void toggle(item.id)}
              />
            </li>
          );
        })}
      </ul>

      <section className="settings-storage-block">
        <div className="settings-theme-head">
          <strong>{t("settings.general.storage.title")}</strong>
          <span>{t("settings.general.storage.description")}</span>
        </div>
        <div className="settings-storage-fields">
          <Field
            label={t("settings.general.dataDir.title")}
            htmlFor={dataDirId}
            description={t("settings.general.dataDir.description")}
          >
            <div className="settings-path-row">
              <Input
                id={dataDirId}
                value={dataDirDraft}
                placeholder={t("settings.general.dataDir.placeholder")}
                onChange={(e) => setDataDirDraft(e.target.value)}
                disabled={dataDirBusy || migrating}
              />
              {canBrowse ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={dataDirBusy || migrating}
                  onClick={() => void browseDataDir()}
                >
                  {t("settings.general.browse")}
                </Button>
              ) : null}
              {dataDirDraft.trim() ? (
                <Button
                  size="sm"
                  variant="text"
                  disabled={dataDirBusy || migrating}
                  onClick={() => setDataDirDraft("")}
                >
                  {t("settings.general.useDefault")}
                </Button>
              ) : null}
              {dataDirDirty && canApplyDataDir ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={dataDirBusy || migrating}
                  onClick={() => void beginSaveDataDir()}
                >
                  {t("settings.general.dataDir.save")}
                </Button>
              ) : null}
              {dataDirDirty ? (
                <Button
                  size="sm"
                  variant="text"
                  disabled={dataDirBusy || migrating}
                  onClick={() => setDataDirDraft(general.dataDir)}
                >
                  {t("settings.general.dataDir.discard")}
                </Button>
              ) : null}
            </div>
          </Field>
          <ul className="settings-toggle-list">
            <li className="settings-toggle-row">
              <div className="settings-toggle-copy">
                <strong>{t("settings.general.logRetention.title")}</strong>
                <span>{t("settings.general.logRetention.description")}</span>
              </div>
              <Select
                className="settings-locale-select"
                value={String(general.logRetentionDays)}
                options={retentionOptions}
                disabled={!general.loggingEnabled}
                onChange={(value) => {
                  const days = Number(value);
                  if (!Number.isFinite(days)) return;
                  void patchGeneral({ logRetentionDays: days });
                }}
                aria-label={t("settings.general.logRetention.title")}
              />
            </li>
            {LOG_TOGGLES.map((item) => (
              <li key={item.id} className="settings-toggle-row">
                <div className="settings-toggle-copy">
                  <strong>{t(item.titleKey)}</strong>
                  <span>{t(item.descriptionKey)}</span>
                </div>
                <Switch
                  checked={general[item.id]}
                  disabled={item.id !== "loggingEnabled" && !general.loggingEnabled}
                  aria-label={t(item.titleKey)}
                  onChange={() => void toggle(item.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {error ? <p className="settings-err">{error}</p> : null}

      <Modal
        open={Boolean(migratePreview) && !migrating}
        onClose={() => {
          if (!dataDirBusy) setMigratePreview(null);
        }}
        closeOnEscape
        aria-labelledby="data-dir-migrate-title"
        panelClassName="settings-data-dir-modal"
      >
        {migratePreview ? (
          <div className="settings-data-dir-dialog">
            <h2 id="data-dir-migrate-title">{t("settings.general.dataDir.migrateTitle")}</h2>
            <p>{t("settings.general.dataDir.migrateLead")}</p>
            <dl className="settings-data-dir-paths">
              <div>
                <dt>{t("settings.general.dataDir.from")}</dt>
                <dd>
                  <code>{migratePreview.from}</code>
                </dd>
              </div>
              <div>
                <dt>{t("settings.general.dataDir.to")}</dt>
                <dd>
                  <code>{migratePreview.to}</code>
                </dd>
              </div>
            </dl>
            <p className="settings-data-dir-size">
              {t("settings.general.dataDir.migrateSize").replace(
                "{size}",
                formatBytes(migratePreview.totalBytes),
              )}
            </p>
            <ul className="settings-data-dir-items">
              {migratePreview.items.map((item) => (
                <li key={item.id}>
                  <span>{item.label}</span>
                  <span>{formatBytes(item.bytes)}</span>
                </li>
              ))}
            </ul>
            <p className="settings-note">{t("settings.general.dataDir.migrateNote")}</p>
            <div className="settings-data-dir-actions">
              <Button
                variant="secondary"
                disabled={dataDirBusy}
                onClick={() => setMigratePreview(null)}
              >
                {t("settings.general.dataDir.cancel")}
              </Button>
              <Button
                variant="secondary"
                disabled={dataDirBusy}
                onClick={() => void confirmDataDirChange(false)}
              >
                {t("settings.general.dataDir.skipMigrate")}
              </Button>
              <Button
                variant="primary"
                disabled={dataDirBusy}
                onClick={() => void confirmDataDirChange(true)}
              >
                {t("settings.general.dataDir.doMigrate")}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={migrating}
        aria-labelledby="data-dir-progress-title"
        panelClassName="settings-data-dir-modal"
      >
        {migrateProgress ? (
          <div className="settings-data-dir-dialog">
            <h2 id="data-dir-progress-title">{t("settings.general.dataDir.progressTitle")}</h2>
            <p>
              {migrateProgress.phase === "copying"
                ? t("settings.general.dataDir.progressCopying").replace(
                    "{current}",
                    migrateProgress.current ?? "…",
                  )
                : migrateProgress.phase === "switching"
                  ? t("settings.general.dataDir.progressSwitching")
                  : migrateProgress.phase === "error"
                    ? migrateProgress.message ?? t("settings.general.dataDir.progressError")
                    : t("settings.general.dataDir.progressPreparing")}
            </p>
            <Progress
              value={migrateProgress.percent}
              aria-label={t("settings.general.dataDir.progressTitle")}
            />
            <p className="settings-note">
              {migrateProgress.total > 0
                ? `${migrateProgress.done} / ${migrateProgress.total}`
                : null}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
