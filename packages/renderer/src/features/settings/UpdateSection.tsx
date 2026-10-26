/**
 * 设置 → 数据：桌面自动更新。
 *
 * 只在已打包的应用里可用；dev 构建下显示「开发模式不支持更新」并禁用所有按钮，
 * 避免误导用户。失败原因照实展示（含 GitHub 限速 / 未签名提示等兜底文案）。
 */
import { Button, ConfirmDialog, Progress } from "@thinker-workbench/design/react";
import { emptyUpdateState, type UpdateState } from "@thinker-workbench/shared";
import { useEffect, useState } from "react";
import {
  checkForUpdate,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  subscribeUpdateState,
} from "../../platform/ipc/update";
import { useI18n } from "../../ui/i18n/useI18n";

export function UpdateSection({ active = true }: { active?: boolean }) {
  const { t } = useI18n();
  const [state, setState] = useState<UpdateState>(() => emptyUpdateState("", false));
  const [busy, setBusy] = useState(false);
  /** 安装会重启应用：先自定义确认，不用 `window.confirm`。 */
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void getUpdateState().then((next) => {
      if (!cancelled) setState(next);
    });
    const unsubscribe = subscribeUpdateState((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [active]);

  if (!state.enabled) {
    return (
      <section className="settings-storage-block">
        <div className="settings-theme-head">
          <strong>{t("settings.general.update.title")}</strong>
          <span>{t("settings.general.update.devOnly")}</span>
        </div>
        <p className="settings-note">
          {t("settings.general.update.currentVersion", { version: state.currentVersion })}
        </p>
      </section>
    );
  }

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-storage-block">
      <div className="settings-theme-head">
        <strong>{t("settings.general.update.title")}</strong>
        <span>{t("settings.general.update.description")}</span>
      </div>

      <p className="settings-note">
        {t("settings.general.update.currentVersion", { version: state.currentVersion })}
      </p>

      {state.phase === "checking" ? (
        <p className="settings-note">{t("settings.general.update.checking")}</p>
      ) : null}
      {state.phase === "not-available" ? (
        <p className="settings-note is-ok">{t("settings.general.update.upToDate")}</p>
      ) : null}
      {state.available ? (
        <p className="settings-note">
          {t("settings.general.update.available", { version: state.available.version })}
        </p>
      ) : null}
      {state.phase === "downloading" ? (
        <Progress
          value={state.percent ?? 0}
          aria-label={t("settings.general.update.downloading")}
        />
      ) : null}
      {state.phase === "downloaded" ? (
        <p className="settings-note is-ok">{t("settings.general.update.downloaded")}</p>
      ) : null}
      {state.error ? <p className="settings-note is-error">{state.error}</p> : null}

      <div className="settings-transfer-actions">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void run(checkForUpdate)}
        >
          {t("settings.general.update.check")}
        </Button>
        {state.phase === "available" || state.phase === "error" ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void run(downloadUpdate)}
          >
            {t("settings.general.update.download")}
          </Button>
        ) : null}
        {state.phase === "downloaded" ? (
          <Button size="sm" variant="primary" disabled={busy} onClick={() => setConfirmOpen(true)}>
            {t("settings.general.update.install")}
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={t("settings.general.update.installTitle")}
        description={t("settings.general.update.installConfirm")}
        confirmLabel={t("settings.general.update.install")}
        cancelLabel={t("common.cancel")}
        busy={busy}
        onConfirm={() => {
          setConfirmOpen(false);
          void run(installUpdate);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}

/** 初始占位：桥接还没返回时用禁用态，避免闪一下「可用」。 */
function emptyPlaceholder() {
  return {
    phase: "disabled" as const,
    currentVersion: "",
    enabled: false,
  };
}
