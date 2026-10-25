/**
 * 设置 → 数据：根目录（草稿 / 迁移）、本机 Trace。
 */
import { Button, Field, Input, Modal, Progress, Switch } from "@thinker-workbench/design/react";
import type { DataDirPaths } from "@thinker-workbench/shared";
import { useEffect, useId, useState } from "react";
import { resolveDataDir } from "../../platform/ipc/thinker";
import { useI18n } from "../../ui/i18n/useI18n";
import { CheckpointRetentionSection } from "./CheckpointRetentionSection";
import { formatBytes } from "./generalLabels";
import { SessionTransferSection } from "./SessionTransferSection";
import { UpdateSection } from "./UpdateSection";
import { useGeneralSettings } from "./useGeneralSettings";

type Props = {
  active?: boolean;
};

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
  }, [available, active]);

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
                  <p className="settings-path-resolved" title={activePaths.bootstrapSettingsPath}>
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
              <p className="settings-path-resolved is-pending" title={draftPaths.settingsPath}>
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
          <strong>{t("settings.general.observability.title")}</strong>
          <span>{t("settings.general.observability.description")}</span>
        </div>
        <ul className="settings-toggle-list">
          <li className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>{t("settings.general.observability.enabled.title")}</strong>
              <span>{t("settings.general.observability.enabled.description")}</span>
            </div>
            <Switch
              checked={general.observabilityEnabled}
              aria-label={t("settings.general.observability.enabled.title")}
              onChange={() =>
                void patchGeneral({ observabilityEnabled: !general.observabilityEnabled })
              }
            />
          </li>
        </ul>
      </section>

      {/* Checkpoint 保留策略：此前只能在 DevTools 控制台调，现在提供正式入口 */}
      <CheckpointRetentionSection active={active} />
      {/* 会话导出 / 导入 */}
      <SessionTransferSection active={active} />
      {/* 桌面自动更新（dev 构建自动显示为不支持） */}
      <UpdateSection active={active} />

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
