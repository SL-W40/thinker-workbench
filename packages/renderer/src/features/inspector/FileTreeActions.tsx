/**
 * 文件树写操作：新建文件 / 新建文件夹 / 重命名 / 删除 / 在文件管理器中显示。
 *
 * Files 与 Changes 两个面板的树需要同一套行为，故抽成 hook + 弹窗组件共用。
 * 所有改动都经主进程路径沙箱（assertInside）校验，前端只负责收集名字与确认。
 */
import { Button, Input, Modal } from "@thinker-workbench/design/react";
import { useState } from "react";
import {
  workspaceMkdir,
  workspaceReadFile,
  workspaceRemove,
  workspaceRename,
  workspaceReveal,
  workspaceWriteFile,
} from "../../platform/ipc/workspaceFs";
import { useT } from "../../ui/i18n/useI18n";

export type FileNamePromptKind = "newFile" | "newFolder" | "rename";

export type FileTreeActions = {
  /** 输入弹窗的状态；null 表示关闭。 */
  namePrompt: { kind: FileNamePromptKind; target: string } | null;
  nameValue: string;
  setNameValue: (value: string) => void;
  /** 待确认删除的相对路径；null 表示没有待确认操作。 */
  pendingRemove: string | null;
  setPendingRemove: (path: string | null) => void;
  busy: boolean;
  error: string | null;
  startNewFile: (dir: string) => void;
  startNewFolder: (dir: string) => void;
  startRename: (path: string) => void;
  /** 关闭输入弹窗（取消 / Esc / 遮罩）。 */
  closeNamePrompt: () => void;
  submitName: () => Promise<void>;
  /** 拖放移动：把 source 移进 targetDir（"" = 工作空间根）。 */
  move: (source: string, targetDir: string) => Promise<void>;
  confirmRemove: () => Promise<void>;
  reveal: (path: string) => Promise<void>;
  clearError: () => void;
};

/** 目录 + 名字拼相对路径；根（"" 或 "."）不产生前导斜杠。 */
function relJoin(dir: string, name: string): string {
  const base = dir === "." ? "" : dir.replace(/\/+$/, "");
  return base ? `${base}/${name}` : name;
}

/** 取父目录；顶层文件返回 ""。 */
function relDirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** 取末段名字。 */
export function baseNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Electron 会给 IPC 失败包一层 "Error invoking remote method ..."，这里剥掉。 */
function cleanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, "");
}

/**
 * @param workspaceId 当前工作空间；空串时写操作会由主进程拒绝。
 * @param onChanged 写成功后刷新树 / git 状态。
 */
export function useFileTreeActions(workspaceId: string, onChanged: () => void): FileTreeActions {
  const t = useT();
  const [namePrompt, setNamePrompt] = useState<{
    kind: FileNamePromptKind;
    target: string;
  } | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (err) {
      setError(cleanError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    namePrompt,
    nameValue,
    setNameValue,
    pendingRemove,
    setPendingRemove,
    busy,
    error,
    startNewFile: (dir) => {
      setError(null);
      setNameValue("");
      setNamePrompt({ kind: "newFile", target: dir });
    },
    startNewFolder: (dir) => {
      setError(null);
      setNameValue("");
      setNamePrompt({ kind: "newFolder", target: dir });
    },
    startRename: (path) => {
      setError(null);
      setNameValue(baseNameOf(path));
      setNamePrompt({ kind: "rename", target: path });
    },
    clearError: () => setError(null),
    closeNamePrompt: () => setNamePrompt(null),
    async submitName() {
      if (!namePrompt) return;
      const name = nameValue.trim();
      if (!name) return;
      const { kind, target } = namePrompt;
      const ok = await run(async () => {
        if (kind === "rename") {
          const next = relJoin(relDirOf(target), name);
          if (next !== target) await workspaceRename(workspaceId, target, next);
        } else if (kind === "newFolder") {
          await workspaceMkdir(workspaceId, relJoin(target, name));
        } else {
          const path = relJoin(target, name);
          // 新建文件要求目标不存在：writeFile 是「保存」语义，直接写会覆盖已有文件。
          const probe = await workspaceReadFile(workspaceId, path);
          if (!probe.missing) throw new Error(`${t("inspector.files.alreadyExists")}: ${path}`);
          await workspaceWriteFile(workspaceId, path, "");
        }
      });
      if (ok) setNamePrompt(null);
    },
    async move(source, targetDir) {
      const name = baseNameOf(source);
      if (!name || targetDir === source) return;
      // 拖进自身或自己的后代会让目标路径消失在源路径里，主进程只能拒同名，这里先拦。
      if (targetDir.startsWith(`${source}/`)) {
        setError(t("inspector.files.moveIntoSelf"));
        return;
      }
      const to = relJoin(targetDir, name);
      if (to === source) return;
      await run(() => workspaceRename(workspaceId, source, to));
    },
    async confirmRemove() {
      const target = pendingRemove;
      if (!target) return;
      const ok = await run(() => workspaceRemove(workspaceId, target));
      if (ok) setPendingRemove(null);
    },
    async reveal(path) {
      await run(() => workspaceReveal(workspaceId, path));
    },
  };
}

/** 与 {@link useFileTreeActions} 配套的两个弹窗。 */
export function FileTreeActionModals({ actions }: { actions: FileTreeActions }) {
  const t = useT();
  const { namePrompt, pendingRemove, busy, error } = actions;

  return (
    <>
      <Modal
        open={namePrompt !== null}
        onClose={actions.closeNamePrompt}
        closeOnBackdrop
        closeOnEscape
        aria-label={t("inspector.files.fileMenu")}
      >
        <Modal.Header
          title={
            namePrompt?.kind === "rename"
              ? t("inspector.files.rename")
              : namePrompt?.kind === "newFolder"
                ? t("inspector.files.newFolder")
                : t("inspector.files.newFile")
          }
        />
        <Modal.Body>
          <Input
            value={actions.nameValue}
            autoFocus
            placeholder={
              namePrompt?.kind === "rename"
                ? t("inspector.files.renamePrompt")
                : namePrompt?.kind === "newFolder"
                  ? t("inspector.files.newFolderPrompt")
                  : t("inspector.files.newFilePrompt")
            }
            aria-label={t("inspector.files.renamePrompt")}
            onChange={(e) => actions.setNameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void actions.submitName();
            }}
          />
          {error ? <div className="file-tree-action-error">{error}</div> : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="text" onClick={actions.closeNamePrompt}>
            {t("inspector.files.actionCancel")}
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void actions.submitName()}>
            {namePrompt?.kind === "rename"
              ? t("inspector.files.actionRename")
              : t("inspector.files.actionCreate")}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* 移动 / 在文件管理器中显示这类无输入框的操作失败时，用它把原因告诉用户。 */}
      <Modal
        open={error !== null && namePrompt === null && pendingRemove === null}
        onClose={actions.clearError}
        closeOnBackdrop
        closeOnEscape
        aria-label={t("inspector.files.actionFailedTitle")}
      >
        <Modal.Header title={t("inspector.files.actionFailedTitle")} />
        <Modal.Body>
          <p className="file-tree-action-error">{error}</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={actions.clearError}>
            {t("inspector.files.actionOk")}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={pendingRemove !== null}
        onClose={() => actions.setPendingRemove(null)}
        closeOnBackdrop
        closeOnEscape
        aria-label={t("inspector.files.deleteConfirmTitle")}
      >
        <Modal.Header title={t("inspector.files.deleteConfirmTitle")} />
        <Modal.Body>
          <p>
            {t("inspector.files.deleteConfirmBody").replace(
              "{name}",
              baseNameOf(pendingRemove ?? ""),
            )}
          </p>
          {error ? <div className="file-tree-action-error">{error}</div> : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="text" onClick={() => actions.setPendingRemove(null)}>
            {t("inspector.files.actionCancel")}
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void actions.confirmRemove()}>
            {t("inspector.files.actionDelete")}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
