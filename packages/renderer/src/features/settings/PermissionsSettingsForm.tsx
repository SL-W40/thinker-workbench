/**
 * 设置 → 权限：工作区访问、AI 能力开关、Shell 审批、白名单与硬拒绝名单、删文件恢复 TTL。
 */
import { Select, Switch } from "@thinker-workbench/design/react";
import {
  DELETE_FILE_RESTORE_TTL_DAY_OPTIONS,
  isShellTokenBlocked,
  MAX_PARALLEL_RUNS_OPTIONS,
  MAX_QUEUED_RUNS_OPTIONS,
  normalizeShellBlocklist,
  QUEUE_TIMEOUT_MIN_OPTIONS,
  SHELL_APPROVAL_MODES,
  type ShellApprovalMode,
  WORKSPACE_ACCESS_OPTIONS,
  type WorkspaceAccess,
} from "@thinker-workbench/shared";
import { useMemo, useState } from "react";
import { useI18n } from "../../ui/i18n/useI18n";
import { deleteRestoreTtlLabel, shellApprovalLabel, workspaceAccessLabel } from "./generalLabels";
import { ShellTokenList } from "./ShellTokenList";
import { useGeneralSettings } from "./useGeneralSettings";

type Props = {
  active?: boolean;
};

export function PermissionsSettingsForm({ active = true }: Props) {
  const { t } = useI18n();
  const { available, general, error, patchGeneral, shellProfiles } = useGeneralSettings(active);
  const [allowlistDraft, setAllowlistDraft] = useState("");
  const [blocklistDraft, setBlocklistDraft] = useState("");

  const workspaceAccessOptions = useMemo(
    () =>
      WORKSPACE_ACCESS_OPTIONS.map((access) => ({
        value: access,
        label: workspaceAccessLabel(access, t),
      })),
    [t],
  );

  const shellApprovalOptions = useMemo(
    () =>
      SHELL_APPROVAL_MODES.map((mode) => ({
        value: mode,
        label: shellApprovalLabel(mode, t),
      })),
    [t],
  );

  const maxParallelOptions = useMemo(
    () =>
      MAX_PARALLEL_RUNS_OPTIONS.map((n) => ({
        value: String(n),
        label: String(n),
      })),
    [],
  );

  const maxQueuedOptions = useMemo(
    () =>
      MAX_QUEUED_RUNS_OPTIONS.map((n) => ({
        value: String(n),
        label: n === 0 ? t("settings.general.maxQueuedRuns.off") : String(n),
      })),
    [t],
  );

  const queueTimeoutOptions = useMemo(
    () =>
      QUEUE_TIMEOUT_MIN_OPTIONS.map((n) => ({
        value: String(n),
        label:
          n === 0
            ? t("settings.general.queueTimeoutMin.off")
            : t("settings.general.queueTimeoutMin.minutes", { n: String(n) }),
      })),
    [t],
  );

  const shellProfileOptions = useMemo(() => {
    const opts = [
      { value: "default", label: t("settings.general.shellProfile.default") },
      ...shellProfiles.map((p) => ({ value: p.id, label: p.name })),
    ];
    if (
      general.shellProfileId &&
      general.shellProfileId !== "default" &&
      !opts.some((o) => o.value === general.shellProfileId)
    ) {
      opts.push({ value: general.shellProfileId, label: general.shellProfileId });
    }
    return opts;
  }, [general.shellProfileId, shellProfiles, t]);

  const deleteRestoreTtlOptions = useMemo(() => {
    const days = new Set<number>([
      ...DELETE_FILE_RESTORE_TTL_DAY_OPTIONS,
      general.deleteFileRestoreTtlDays,
    ]);
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

  function addAllowlistToken() {
    const token = allowlistDraft.trim().toLowerCase();
    if (!token) return;
    setAllowlistDraft("");
    if (general.shellAllowlist.includes(token)) return;
    // 已在硬拒绝名单上的 token 保持可见的拒绝，不写入白名单
    if (isShellTokenBlocked(token, general.shellBlocklist)) return;
    void patchGeneral({
      shellAllowlist: [...general.shellAllowlist, token],
    });
  }

  function addBlocklistToken() {
    const token = normalizeShellBlocklist([blocklistDraft])[0];
    if (!token) return;
    setBlocklistDraft("");
    if (general.shellBlocklist.includes(token)) return;
    void patchGeneral({
      shellBlocklist: [...general.shellBlocklist, token],
      shellAllowlist: general.shellAllowlist.filter((item) => !isShellTokenBlocked(item, [token])),
    });
  }

  if (!available) {
    return (
      <p className="settings-note">{t("settings.general.unavailable", { cmd: "pnpm run dev" })}</p>
    );
  }

  return (
    <div className="settings-general">
      <ul className="settings-toggle-list">
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.maxParallelRuns.title")}</strong>
            <span>{t("settings.general.maxParallelRuns.description")}</span>
          </div>
          <Select
            className="settings-locale-select"
            value={String(general.maxParallelRuns)}
            options={maxParallelOptions}
            aria-label={t("settings.general.maxParallelRuns.title")}
            onChange={(value) => void patchGeneral({ maxParallelRuns: Number(value) })}
          />
        </li>
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.maxQueuedRuns.title")}</strong>
            <span>{t("settings.general.maxQueuedRuns.description")}</span>
          </div>
          <Select
            className="settings-locale-select"
            value={String(general.maxQueuedRuns)}
            options={maxQueuedOptions}
            aria-label={t("settings.general.maxQueuedRuns.title")}
            onChange={(value) => void patchGeneral({ maxQueuedRuns: Number(value) })}
          />
        </li>
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.queueTimeoutMin.title")}</strong>
            <span>{t("settings.general.queueTimeoutMin.description")}</span>
          </div>
          <Select
            className="settings-locale-select"
            value={String(general.queueTimeoutMin)}
            options={queueTimeoutOptions}
            aria-label={t("settings.general.queueTimeoutMin.title")}
            onChange={(value) => void patchGeneral({ queueTimeoutMin: Number(value) })}
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
            <strong>{t("settings.general.allowAiShell.title")}</strong>
            <span>{t("settings.general.allowAiShell.description")}</span>
          </div>
          <Switch
            checked={general.allowAiShell}
            aria-label={t("settings.general.allowAiShell.title")}
            onChange={(allowAiShell) => void patchGeneral({ allowAiShell })}
          />
        </li>
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.shellProfile.title")}</strong>
            <span>{t("settings.general.shellProfile.description")}</span>
          </div>
          <Select
            className="settings-locale-select"
            value={general.shellProfileId}
            options={shellProfileOptions}
            aria-label={t("settings.general.shellProfile.title")}
            onChange={(shellProfileId) => void patchGeneral({ shellProfileId })}
          />
        </li>
        <li className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.shellApprovalMode.title")}</strong>
            <span>{t("settings.general.shellApprovalMode.description")}</span>
          </div>
          <Select
            className="settings-locale-select"
            value={general.shellApprovalMode}
            options={shellApprovalOptions}
            aria-label={t("settings.general.shellApprovalMode.title")}
            onChange={(shellApprovalMode) =>
              void patchGeneral({ shellApprovalMode: shellApprovalMode as ShellApprovalMode })
            }
          />
        </li>
        <li className="settings-toggle-row settings-toggle-row--stack">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.shellAllowlist.title")}</strong>
            <span>{t("settings.general.shellAllowlist.description")}</span>
          </div>
          <ShellTokenList
            tokens={general.shellAllowlist}
            draft={allowlistDraft}
            onDraftChange={setAllowlistDraft}
            onAdd={addAllowlistToken}
            onRemove={(token) =>
              void patchGeneral({
                shellAllowlist: general.shellAllowlist.filter((x) => x !== token),
              })
            }
            placeholder={t("settings.general.shellAllowlist.placeholder")}
            addLabel={t("settings.general.shellAllowlist.add")}
            removeLabel={t("settings.general.shellAllowlist.remove")}
            emptyHint={t("settings.general.shellAllowlist.empty")}
          />
        </li>
        <li className="settings-toggle-row settings-toggle-row--stack">
          <div className="settings-toggle-copy">
            <strong>{t("settings.general.shellBlocklist.title")}</strong>
            <span>{t("settings.general.shellBlocklist.description")}</span>
          </div>
          <ShellTokenList
            tokens={general.shellBlocklist}
            draft={blocklistDraft}
            onDraftChange={setBlocklistDraft}
            onAdd={addBlocklistToken}
            onRemove={(token) =>
              void patchGeneral({
                shellBlocklist: general.shellBlocklist.filter((x) => x !== token),
              })
            }
            placeholder={t("settings.general.shellBlocklist.placeholder")}
            addLabel={t("settings.general.shellBlocklist.add")}
            removeLabel={t("settings.general.shellBlocklist.remove")}
            emptyHint={t("settings.general.shellBlocklist.empty")}
            tone="danger"
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
      </ul>
      {error ? <p className="settings-err">{error}</p> : null}
    </div>
  );
}
