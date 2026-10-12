/**
 * 设置 → 数据：根目录（草稿 / 迁移）、会话 Trace 开关与保留/截断。
 */
import { Button, Field, Input, Modal, Progress, Select, Switch } from "@thinker-workbench/design/react";
import {
  LOG_RETENTION_DAY_OPTIONS,
  type DataDirPaths,
} from "@thinker-workbench/shared";
import { useEffect, useId, useMemo, useState } from "react";
import { resolveDataDir } from "../../bridge/thinker";
import { useI18n } from "../../i18n/useI18n";
import { formatBytes, retentionLabel } from "./generalLabels";
import { useGeneralSettings } from "./useGeneralSettings";

type Props = {
  active?: boolean;
};

const TRACE_PRESETS = {
  strict: {
    traceMaxFieldBytes: 64_000,
    traceMaxPayloadBytes: 256_000,
    traceMaxMessageChars: 20_000,
    traceMaxHistoryMessages: 40,
  },
  default: {
    traceMaxFieldBytes: 262_144,
    traceMaxPayloadBytes: 1_048_576,
    traceMaxMessageChars: 100_000,
    traceMaxHistoryMessages: 200,
  },
  verbose: {
    traceMaxFieldBytes: 1_048_576,
    traceMaxPayloadBytes: 4_194_304,
    traceMaxMessageChars: 400_000,
    traceMaxHistoryMessages: 500,
  },
} as const;

export function DataSettingsForm({ active = true }: Props) {
  const { t } = useI18n();
  const dataDirId = useId();
  const {
    available,
    general,
    error,
    patchGeneral,
    dataDirDraft,
    setDataDirDraft,
    dataDirDirty,
    dataDirBusy,
    canBrowse,
    canApplyDataDir,
    migratePreview,
    setMigratePreview,
    migrateProgress,
    migrating,
    browseDataDir,
    beginSaveDataDir,
    confirmDataDirChange,
  } = useGeneralSettings(active);

  const retentionOptions = useMemo(() => {
    const days = new Set<number>([...LOG_RETENTION_DAY_OPTIONS, general.traceRetentionDays]);
    return [...days]
      .sort((a, b) => a - b)
      .map((value) => ({
        value: String(value),
        label: retentionLabel(value, t),
      }));
  }, [general.traceRetentionDays, t]);

  /** 当前 / 草稿的数据根与 settings 落点（含固定引导路径） */
  const [activePaths, setActivePaths] = useState<DataDirPaths | null>(null);
  const [draftPaths, setDraftPaths] = useState<DataDirPaths | null>(null);

  useEffect(() => {
    if (!available || !active) return;
    let cancelled = false;
    void resolveDataDir()
      .then((p) => {
        if (!cancelled) setActivePaths(p);
      })
      .catch(() => {
        if (!cancelled) setActivePaths(null);
      });
    return () => {
      cancelled = true;
    };
  }, [available, active, general.dataDir]);

  useEffect(() => {
    if (!available || !active) return;
    let cancelled = false;
    void resolveDataDir(dataDirDraft)
      .then((p) => {
        if (!cancelled) setDraftPaths(p);
      })
      .catch(() => {
        if (!cancelled) setDraftPaths(null);
      });
    return () => {
      cancelled = true;
    };
  }, [available, active, dataDirDraft]);

  if (!available) {
    return (
      <p className="settings-note">{t("settings.general.unavailable", { cmd: "pnpm run dev" })}</p>
    );
  }

  return (
    <div className="settings-general">
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
            {activePaths ? (
              <div className="settings-path-resolved-list">
                <p className="settings-path-resolved" title={activePaths.settingsPath}>
                  <span className="settings-path-resolved__label">
                    {t("settings.general.dataDir.settingsPath")}
                  </span>
                  <code>{activePaths.settingsPath}</code>
                </p>
                {!activePaths.sameAsBootstrap ? (
                  <p
                    className="settings-path-resolved"
                    title={activePaths.bootstrapSettingsPath}
                  >
                    <span className="settings-path-resolved__label">
                      {t("settings.general.dataDir.bootstrapPath")}
                    </span>
                    <code>{activePaths.bootstrapSettingsPath}</code>
                  </p>
                ) : null}
              </div>
            ) : null}
            {dataDirDirty &&
            draftPaths &&
            activePaths &&
            draftPaths.settingsPath !== activePaths.settingsPath ? (
              <p
                className="settings-path-resolved is-pending"
                title={draftPaths.settingsPath}
              >
                <span className="settings-path-resolved__label">
                  {t("settings.general.dataDir.pendingPath")}
                </span>
                <code>{draftPaths.settingsPath}</code>
              </p>
            ) : null}
          </Field>
        </div>
      </section>

      <section className="settings-storage-block">
        <div className="settings-theme-head">
          <strong>{t("settings.general.trace.title")}</strong>
          <span>{t("settings.general.trace.description")}</span>
        </div>
        <ul className="settings-toggle-list">
          <li className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>{t("settings.general.trace.enabled.title")}</strong>
              <span>{t("settings.general.trace.enabled.description")}</span>
            </div>
            <Switch
              checked={general.traceEnabled}
              aria-label={t("settings.general.trace.enabled.title")}
              onChange={() => void patchGeneral({ traceEnabled: !general.traceEnabled })}
            />
          </li>
          <li className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>{t("settings.general.trace.retention.title")}</strong>
              <span>{t("settings.general.trace.retention.description")}</span>
            </div>
            <Select
              className="settings-locale-select"
              value={String(general.traceRetentionDays)}
              options={retentionOptions}
              disabled={!general.traceEnabled}
              onChange={(value) => {
                const days = Number(value);
                if (!Number.isFinite(days)) return;
                void patchGeneral({ traceRetentionDays: days });
              }}
              aria-label={t("settings.general.trace.retention.title")}
            />
          </li>
          <li className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>{t("settings.general.trace.maxSessions.title")}</strong>
              <span>{t("settings.general.trace.maxSessions.description")}</span>
            </div>
            <Select
              className="settings-locale-select"
              value={String(general.traceMaxSessions)}
              options={[
                { value: "0", label: "∞" },
                { value: "50", label: "50" },
                { value: "200", label: "200" },
                { value: "500", label: "500" },
              ]}
              disabled={!general.traceEnabled}
              onChange={(value) => {
                const n = Number(value);
                if (!Number.isFinite(n)) return;
                void patchGeneral({ traceMaxSessions: n });
              }}
              aria-label={t("settings.general.trace.maxSessions.title")}
            />
          </li>
          <li className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>{t("settings.general.trace.maxTotalBytes.title")}</strong>
              <span>{t("settings.general.trace.maxTotalBytes.description")}</span>
            </div>
            <Select
              className="settings-locale-select"
              value={String(general.traceMaxTotalBytes)}
              options={[
                { value: "0", label: "∞" },
                { value: String(512 * 1024 * 1024), label: "512 MiB" },
                { value: String(5_368_709_120), label: "5 GiB" },
                { value: String(21_474_836_480), label: "20 GiB" },
              ]}
              disabled={!general.traceEnabled}
              onChange={(value) => {
                const n = Number(value);
                if (!Number.isFinite(n)) return;
                void patchGeneral({ traceMaxTotalBytes: n });
              }}
              aria-label={t("settings.general.trace.maxTotalBytes.title")}
            />
          </li>
          <li className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>{t("settings.general.trace.truncate.title")}</strong>
              <span>{t("settings.general.trace.truncate.description")}</span>
            </div>
            <Switch
              checked={general.traceTruncateEnabled}
              disabled={!general.traceEnabled}
              aria-label={t("settings.general.trace.truncate.title")}
              onChange={() =>
                void patchGeneral({ traceTruncateEnabled: !general.traceTruncateEnabled })
              }
            />
          </li>
          <li className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>{t("settings.general.trace.presets.label")}</strong>
            </div>
            <Select
              className="settings-locale-select"
              value="default"
              options={[
                { value: "strict", label: t("settings.general.trace.presets.strict") },
                { value: "default", label: t("settings.general.trace.presets.default") },
                { value: "verbose", label: t("settings.general.trace.presets.verbose") },
              ]}
              disabled={!general.traceEnabled || !general.traceTruncateEnabled}
              onChange={(value) => {
                const preset = TRACE_PRESETS[value as keyof typeof TRACE_PRESETS];
                if (!preset) return;
                void patchGeneral({ ...preset });
              }}
              aria-label={t("settings.general.trace.presets.label")}
            />
          </li>
          <li className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>{t("settings.general.trace.captureBinary.title")}</strong>
            </div>
            <Select
              className="settings-locale-select"
              value={general.traceCaptureBinary}
              options={[
                { value: "meta", label: t("settings.general.trace.captureBinary.meta") },
                { value: "omit", label: t("settings.general.trace.captureBinary.omit") },
              ]}
              disabled={!general.traceEnabled}
              onChange={(value) => {
                if (value === "meta" || value === "omit") {
                  void patchGeneral({ traceCaptureBinary: value });
                }
              }}
              aria-label={t("settings.general.trace.captureBinary.title")}
            />
          </li>
        </ul>
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
            {migratePreview.items.length > 0 ? (
              <>
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
              </>
            ) : null}
            <p className="settings-data-dir-note">{t("settings.general.dataDir.migrateNote")}</p>
            <div className="settings-data-dir-actions">
              <Button
                variant="secondary"
                disabled={dataDirBusy}
                onClick={() => void confirmDataDirChange(false)}
              >
                {t("settings.general.dataDir.skipMigrate")}
              </Button>
              <Button
                variant="primary"
                disabled={dataDirBusy || migratePreview.items.length === 0}
                onClick={() => void confirmDataDirChange(true)}
              >
                {t("settings.general.dataDir.doMigrate")}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {migrating && migrateProgress ? (
        <div className="settings-data-dir-progress" role="status">
          <p>{t("settings.general.dataDir.progressTitle")}</p>
          <Progress value={migrateProgress.percent} />
        </div>
      ) : null}
    </div>
  );
}
