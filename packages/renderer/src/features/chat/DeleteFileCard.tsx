/**
 * delete_file 结果卡片：与 FileDiff 同量级表面，含状态徽章与「恢复」。
 */
import { Badge, Button } from "@thinker-workbench/design/react";
import { useState } from "react";
import { useT } from "../../i18n/I18nProvider";

type Props = {
  path?: string;
  running?: boolean;
  failed?: boolean;
  /** 已成功写回。 */
  restored?: boolean;
  canRestore?: boolean;
  onRestore?: () => void | Promise<void>;
  onOpenFile?: (path: string) => void;
};

function fileName(path?: string): string {
  if (!path) return "file";
  return path.split(/[/\\]/).pop() || path;
}

function fileExt(path?: string): string | undefined {
  if (!path) return undefined;
  const base = fileName(path);
  const dot = base.lastIndexOf(".");
  if (dot < 0) return undefined;
  return base.slice(dot + 1).toLowerCase();
}

function fileBadge(ext?: string): string {
  if (!ext) return "{}";
  if (ext === "ts" || ext === "tsx") return "TS";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "JS";
  if (ext === "json") return "{}";
  if (ext === "md" || ext === "markdown") return "MD";
  if (ext === "py") return "PY";
  return ext.slice(0, 2).toUpperCase();
}

export function DeleteFileCard({
  path,
  running = false,
  failed = false,
  restored = false,
  canRestore = false,
  onRestore,
  onOpenFile,
}: Props) {
  const t = useT();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localRestored, setLocalRestored] = useState(false);
  const name = fileName(path);
  const ext = fileExt(path);
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

  const badgeVariant = running
    ? "neutral"
    : failed
      ? "danger"
      : showRestored
        ? "success"
        : "danger";

  const body = running
    ? t("chat.deletingFileHint")
    : failed
      ? t("chat.deleteFileFailedHint")
      : showRestored
        ? t("chat.restoreDeletedFileHint")
        : t("chat.deletedFileHint");

  return (
    <div
      className={`run-delete-card${running ? " is-running" : ""}${failed ? " is-failed" : ""}${showRestored ? " is-restored" : ""}`}
    >
      <div className="run-delete-card__head">
        <span className={`run-diff-icon run-diff-icon--${ext || "file"}`} aria-hidden="true">
          {fileBadge(ext)}
        </span>
        {canOpen ? (
          <button
            type="button"
            className="run-diff-name is-link"
            onClick={() => onOpenFile?.(path!)}
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
            variant="secondary"
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
