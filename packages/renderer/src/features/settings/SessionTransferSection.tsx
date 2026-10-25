/**
 * 设置 → 数据：会话导出 / 导入。
 *
 * 导出 Markdown 给人看，导出 JSON 无损往返；导入一律新建会话，绝不覆盖既有会话。
 */
import { Button } from "@thinker-workbench/design/react";
import { useState } from "react";
import {
  exportSessionFile,
  getActiveSessionId,
  getLastWorkspaceId,
  importSessionFile,
} from "../../platform/ipc/workspaces";
import { useI18n } from "../../ui/i18n/useI18n";

export function SessionTransferSection({ active = true }: { active?: boolean }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportSession(format: "markdown" | "json") {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const sessionId = await getActiveSessionId();
      if (!sessionId) {
        setError(t("settings.general.transfer.noSession"));
        return;
      }
      const res = await exportSessionFile({ sessionId, format });
      if (res.ok && res.path) setNotice(t("settings.general.transfer.exported"));
      else if (!res.ok) setError(res.error ?? t("settings.general.transfer.exportFailed"));
      // 用户取消保存框时不算错误，静默返回
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function importSession() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const workspaceId = await getLastWorkspaceId();
      if (!workspaceId) {
        setError(t("settings.general.transfer.noWorkspace"));
        return;
      }
      const res = await importSessionFile({ workspaceId });
      if (res.ok) {
        setNotice(
          t("settings.general.transfer.imported", {
            title: res.title ?? "",
            count: String(res.messageCount ?? 0),
          }),
        );
      } else if (res.error === "已取消") {
        // 主动取消：不打扰
      } else {
        setError(res.error ?? t("settings.general.transfer.importFailed"));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!active) return null;

  return (
    <section className="settings-storage-block">
      <div className="settings-theme-head">
        <strong>{t("settings.general.transfer.title")}</strong>
        <span>{t("settings.general.transfer.description")}</span>
      </div>
      <div className="settings-transfer-actions">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void exportSession("markdown")}
        >
          {t("settings.general.transfer.exportMarkdown")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void exportSession("json")}
        >
          {t("settings.general.transfer.exportJson")}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void importSession()}>
          {t("settings.general.transfer.import")}
        </Button>
      </div>
      {notice ? <p className="settings-note is-ok">{notice}</p> : null}
      {error ? <p className="settings-note is-error">{error}</p> : null}
    </section>
  );
}
