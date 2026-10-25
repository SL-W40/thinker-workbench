/**
 * delete_file 结果卡片：与 FileDiff 同量级表面，含状态徽章与「恢复」。 */
import { Badge, Button } from "@thinker-workbench/design/react";
import { useState } from "react";
import { useT } from "../../../ui/i18n/useI18n";
import { FileGlyph } from "../../../ui/icons";
import { readDeleteFileRestoreTtlDays } from "../timeline/deleteRestore";

type Props = {
  path?: string;
  running?: boolean;
  failed?: boolean;
  /** 已成功写回*/
  restored?: boolean;
  canRestore?: boolean;
  /** 删除目标是目录（目录内容不缓存，无法恢复）。 */
  isDirectory?: boolean;
  /** 缓存写入时间戳（Unix ms），用于展示剩余可恢复时长。 */
  restoreCachedAt?: number;
  onRestore?: () => void | Promise<void>;
  onOpenFile?: (path: string) => void;
};

function fileName(path?: string): string {
  if (!path) return "file";
  return path.split(/[/\\]/).pop() || path;
}

/** 剩余可恢复时长；ttl=0（永不超时）或无时间戳时返回 null。 */
function restoreRemaining(
  restoreCachedAt: number | undefined,
  ttlDays: number,
  now = Date.now(),
): { value: number; unit: "day" | "hour" | "minute" } | null {
  if (ttlDays <= 0 || typeof restoreCachedAt !== "number") return null;
  const left = restoreCachedAt + ttlDays * 86_400_000 - now;
  if (left <= 0) return null;
  const days = Math.ceil(left / 86_400_000);
  if (days >= 1) return { value: days, unit: "day" };
  const hours = Math.ceil(left / 3_600_000);
  if (hours >= 1) return { value: hours, unit: "hour" };
  return { value: Math.max(1, Math.ceil(left / 60_000)), unit: "minute" };
}

export function DeleteFileCard({
  path,
  running = false,
  failed = false,
  restored = false,
  canRestore = false,
  isDirectory = false,
  restoreCachedAt,
  onRestore,
  onOpenFile,
}: Props) {
  const t = useT();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localRestored, setLocalRestored] = useState(false);
  const name = fileName(path);
  const showRestored = restored || localRestored;
  const canOpen = Boolean(path && onOpenFile && showRestored);

  async function handleRestore() {
    if (!onRestore || restoring) return;
    setRestoring(true);
    setError(null);
    try {
      await onRestore();
      setLocalRestored(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(false);
    }
  }

  const statusLabel = running
    ? t("chat.deletingFileLabel")
    : failed
      ? t("chat.toolFailed")
      : showRestored
        ? t("chat.restoreDeletedFileDone")
        : t("chat.deletedFileLabel");

  // 删除成功是常规结果，用中性灰降低视觉权重；红色只留给失败。
  const badgeVariant = running
    ? "neutral"
    : failed
      ? "danger"
      : showRestored
        ? "success"
        : "neutral";

  const ttlDays = readDeleteFileRestoreTtlDays();
  const remaining = restoreRemaining(restoreCachedAt, ttlDays);
  const remainingLabel = remaining
    ? remaining.unit === "day"
      ? t("chat.restoreRemainingDays", { n: String(remaining.value) })
      : remaining.unit === "hour"
        ? t("chat.restoreRemainingHours", { n: String(remaining.value) })
        : t("chat.restoreRemainingMinutes", { n: String(remaining.value) })
    : "";

  const body = running
    ? t("chat.deletingFileHint")
    : failed
      ? t("chat.deleteFileFailedHint")
      : showRestored
        ? t("chat.restoreDeletedFileHint")
        : canRestore
          ? ttlDays <= 0
            ? t("chat.deletedFileHintNever")
            : t("chat.deletedFileHint", { remaining: remainingLabel })
          : isDirectory
            ? t("chat.deletedDirHint")
            : t("chat.deletedFileLargeHint");

  return (
    <div
      className={`run-delete-card${running ? " is-running" : ""}${failed ? " is-failed" : ""}${showRestored ? " is-restored" : ""}`}
    >
      <div className="run-delete-card__head">
        <span className="run-diff-icon" aria-hidden="true">
          <FileGlyph name={name} />
        </span>
        {canOpen ? (
          <button
            type="button"
            className="run-diff-name is-link"
            onClick={() => {
              if (path) onOpenFile?.(path);
            }}
            aria-label={t("inspector.changes.openFile")}
          >
            {name}
          </button>
        ) : (
          <span className="run-diff-name">{name}</span>
        )}
        <Badge variant={badgeVariant} className="run-delete-card__badge">
          {statusLabel}
        </Badge>
        {canRestore && !showRestored ? (
          <Button
            variant="ghost"
            size="sm"
            className="run-delete-card__restore"
            disabled={restoring}
            onClick={() => void handleRestore()}
          >
            {restoring ? t("chat.restoreDeletedFileBusy") : t("chat.restoreDeletedFile")}
          </Button>
        ) : null}
      </div>
      <p className="run-delete-card__body">{body}</p>
      {error ? (
        <p className="run-delete-card__error" role="alert">
          {t("chat.restoreDeletedFileFailed", { error })}
        </p>
      ) : null}
    </div>
  );
}
