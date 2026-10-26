/**
 * 设置 → 数据：Checkpoint 保留策略（此前只能在 DevTools 控制台调）。
 *
 * 四个阈值（轮数 / 天数 / 总字节 / 单文件字节）任一超限即裁剪；
 * running、pending-resume、每会话最新 run 三类永不裁剪（服务端硬保证）。
 */
import { Button, ConfirmDialog, Field, Input } from "@thinker-workbench/design/react";
import {
  CHECKPOINT_RETENTION_RANGES,
  type CheckpointRetention,
  type CheckpointStats,
  DEFAULT_CHECKPOINT_RETENTION,
} from "@thinker-workbench/shared";
import { useEffect, useMemo, useState } from "react";
import {
  getCheckpointRetention,
  getCheckpointStats,
  pruneCheckpoints,
  setCheckpointRetention,
} from "../../platform/ipc/checkpoints";
import { getLastWorkspaceId } from "../../platform/ipc/workspaces";
import { useI18n } from "../../ui/i18n/useI18n";

/** MB → bytes（UI 用 MB，存储用字节）。 */
function mb(bytes: number): string {
  return String(Math.round((bytes / (1024 * 1024)) * 100) / 100);
}

/** 占位：把 UI 数字转回字节（非法值返回 null，由调用方忽略）。 */
function fromMb(text: string): number | null {
  const n = Number.parseFloat(text);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1024 * 1024);
}

export function CheckpointRetentionSection({ active = true }: { active?: boolean }) {
  const { t } = useI18n();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [policy, setPolicy] = useState<CheckpointRetention>(DEFAULT_CHECKPOINT_RETENTION);
  const [stats, setStats] = useState<CheckpointStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 清理不可逆：走自定义确认对话框，不用 `window.confirm`。 */
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 策略是按工作区存的：先拿到最近使用的工作区
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void getLastWorkspaceId()
      .then((id) => {
        if (!cancelled) setWorkspaceId(id);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !workspaceId) return;
    let cancelled = false;
    void Promise.all([getCheckpointRetention(workspaceId), getCheckpointStats(workspaceId)])
      .then(([nextPolicy, nextStats]) => {
        if (cancelled) return;
        setPolicy(nextPolicy);
        setStats(nextStats);
      })
      .catch(() => {
        /* 读取失败时保留默认值，不阻断设置页 */
      });
    return () => {
      cancelled = true;
    };
  }, [active, workspaceId]);

  const usageText = useMemo(() => {
    if (!stats) return "";
    return t("settings.general.checkpoint.usage", {
      runs: String(stats.runCount),
      bytes: mb(stats.totalBytes),
    });
  }, [stats, t]);

  /** 提交某一项阈值改动（立即生效，无需额外保存按钮）。 */
  async function patch(next: Partial<CheckpointRetention>) {
    if (!workspaceId || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await setCheckpointRetention(workspaceId, next);
      setPolicy(saved);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function prune() {
    if (!workspaceId || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await pruneCheckpoints(workspaceId);
      if (!res.ok) {
        setError(res.error ?? t("settings.general.checkpoint.pruneFailed"));
      } else {
        setNotice(t("settings.general.checkpoint.pruned", { runs: String(res.removedRuns) }));
      }
      setStats(await getCheckpointStats(workspaceId));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!workspaceId) return null;

  return (
    <section className="settings-storage-block">
      <div className="settings-theme-head">
        <strong>{t("settings.general.checkpoint.title")}</strong>
        <span>{t("settings.general.checkpoint.description")}</span>
      </div>

      <div className="settings-checkpoint-fields">
        <Field label={t("settings.general.checkpoint.maxRuns")} htmlFor="ckpt-runs">
          <Input
            id="ckpt-runs"
            type="number"
            size="sm"
            value={String(policy.maxRuns)}
            min={CHECKPOINT_RETENTION_RANGES.maxRuns.min}
            max={CHECKPOINT_RETENTION_RANGES.maxRuns.max}
            disabled={busy}
            onChange={(e) => setPolicy((p) => ({ ...p, maxRuns: Number(e.target.value) }))}
            onBlur={(e) => void patch({ maxRuns: Number(e.target.value) })}
          />
        </Field>
        <Field label={t("settings.general.checkpoint.maxAgeDays")} htmlFor="ckpt-days">
          <Input
            id="ckpt-days"
            type="number"
            size="sm"
            value={String(policy.maxAgeDays)}
            min={CHECKPOINT_RETENTION_RANGES.maxAgeDays.min}
            max={CHECKPOINT_RETENTION_RANGES.maxAgeDays.max}
            disabled={busy}
            onChange={(e) => setPolicy((p) => ({ ...p, maxAgeDays: Number(e.target.value) }))}
            onBlur={(e) => void patch({ maxAgeDays: Number(e.target.value) })}
          />
        </Field>
        <Field label={t("settings.general.checkpoint.maxTotalBytes")} htmlFor="ckpt-total">
          <Input
            id="ckpt-total"
            size="sm"
            value={mb(policy.maxTotalBytes)}
            disabled={busy}
            onChange={(e) => {
              const bytes = fromMb(e.target.value);
              if (bytes !== null) setPolicy((p) => ({ ...p, maxTotalBytes: bytes }));
            }}
            onBlur={(e) => {
              const bytes = fromMb(e.target.value);
              if (bytes !== null) void patch({ maxTotalBytes: bytes });
            }}
          />
        </Field>
        <Field label={t("settings.general.checkpoint.maxFileBytes")} htmlFor="ckpt-file">
          <Input
            id="ckpt-file"
            size="sm"
            value={mb(policy.maxFileBytes)}
            disabled={busy}
            onChange={(e) => {
              const bytes = fromMb(e.target.value);
              if (bytes !== null) setPolicy((p) => ({ ...p, maxFileBytes: bytes }));
            }}
            onBlur={(e) => {
              const bytes = fromMb(e.target.value);
              if (bytes !== null) void patch({ maxFileBytes: bytes });
            }}
          />
        </Field>
      </div>

      <p className="settings-note">{usageText}</p>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmOpen(true)}>
        {t("settings.general.checkpoint.pruneNow")}
      </Button>
      {notice ? <p className="settings-note is-ok">{notice}</p> : null}
      {error ? <p className="settings-note is-error">{error}</p> : null}
      <ConfirmDialog
        open={confirmOpen}
        title={t("settings.general.checkpoint.pruneTitle")}
        description={t("settings.general.checkpoint.pruneConfirm")}
        confirmLabel={t("settings.general.checkpoint.pruneNow")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        busy={busy}
        onConfirm={() => {
          setConfirmOpen(false);
          void prune();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}
