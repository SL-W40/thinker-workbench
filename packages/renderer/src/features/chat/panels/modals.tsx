/**
 * 侧栏三个弹窗：会话重命名 / 工作区别名 / 删除确认。
 */
import { Button, Field, Input, Modal } from "@thinker-workbench/design/react";
import type { WorkspaceRecord } from "@thinker-workbench/shared";
import { useT } from "../../../ui/i18n/useI18n";
import { folderBasename } from "./utils";

export type ConfirmState =
  | { kind: "delete-workspace"; id: string; name: string }
  | { kind: "clear-workspace"; id: string; name: string }
  | { kind: "session"; id: string; title: string }
  | null;

type Props = {
  renameEdit: { id: string; draft: string } | null;
  aliasEdit: { id: string; draft: string } | null;
  confirm: ConfirmState;
  workspaces: WorkspaceRecord[];
  onRenameDraft: (draft: string) => void;
  onCommitRename: () => void;
  onCloseRename: () => void;
  onAliasDraft: (draft: string) => void;
  onCommitAlias: () => void;
  onCloseAlias: () => void;
  onConfirmCommit: () => void;
  onCloseConfirm: () => void;
};

export function SidebarModals({
  renameEdit,
  aliasEdit,
  confirm,
  workspaces,
  onRenameDraft,
  onCommitRename,
  onCloseRename,
  onAliasDraft,
  onCommitAlias,
  onCloseAlias,
  onConfirmCommit,
  onCloseConfirm,
}: Props) {
  const t = useT();
  const aliasRootPath = (workspaces.find((w) => w.id === aliasEdit?.id)?.rootPath ?? "") as string;

  return (
    <>
      <Modal
        open={Boolean(renameEdit)}
        onClose={onCloseRename}
        closeOnBackdrop
        closeOnEscape
        aria-label={t("workspaces.renameTitle")}
      >
        <h2 className="components-modal-title">{t("workspaces.renameTitle")}</h2>
        {renameEdit ? (
          <Field label={t("workspaces.renameLabel")} htmlFor="ws-rename-input">
            <Input
              id="ws-rename-input"
              value={renameEdit.draft}
              autoFocus
              onChange={(e) => onRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitRename();
              }}
            />
          </Field>
        ) : null}
        <div className="components-row components-row--end">
          <Button variant="ghost" onClick={onCloseRename}>
            {t("workspaces.cancel")}
          </Button>
          <Button variant="primary" onClick={onCommitRename}>
            {t("workspaces.renameSave")}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(aliasEdit)}
        onClose={onCloseAlias}
        closeOnBackdrop
        closeOnEscape
        aria-label={t("workspaces.aliasTitle")}
      >
        <h2 className="components-modal-title">{t("workspaces.aliasTitle")}</h2>
        <p className="components-modal-body">{t("workspaces.aliasHint")}</p>
        {aliasEdit ? (
          <>
            <p className="ws-alias-modal__path">
              {t("workspaces.aliasFolder", { path: aliasRootPath })}
            </p>
            <Field label={t("workspaces.aliasLabel")} htmlFor="ws-alias-input">
              <Input
                id="ws-alias-input"
                value={aliasEdit.draft}
                autoFocus
                placeholder={folderBasename(aliasRootPath)}
                onChange={(e) => onAliasDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCommitAlias();
                }}
              />
            </Field>
          </>
        ) : null}
        <div className="components-row components-row--end">
          <Button variant="ghost" onClick={onCloseAlias}>
            {t("workspaces.cancel")}
          </Button>
          <Button variant="primary" onClick={onCommitAlias}>
            {t("workspaces.aliasSave")}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(confirm)}
        onClose={onCloseConfirm}
        closeOnBackdrop
        closeOnEscape
        aria-label={
          confirm?.kind === "delete-workspace"
            ? t("workspaces.deleteWorkspaceTitle")
            : confirm?.kind === "clear-workspace"
              ? t("workspaces.clearWorkspaceTitle")
              : t("workspaces.deleteSessionTitle")
        }
      >
        <h2 className="components-modal-title">
          {confirm?.kind === "delete-workspace"
            ? t("workspaces.deleteWorkspaceTitle")
            : confirm?.kind === "clear-workspace"
              ? t("workspaces.clearWorkspaceTitle")
              : t("workspaces.deleteSessionTitle")}
        </h2>
        <p className="components-modal-body">
          {confirm?.kind === "delete-workspace"
            ? t("workspaces.deleteWorkspaceBody")
            : confirm?.kind === "clear-workspace"
              ? t("workspaces.clearWorkspaceBody")
              : t("workspaces.deleteSessionBody")}
        </p>
        <div className="components-row components-row--end">
          <Button variant="ghost" onClick={onCloseConfirm}>
            {t("workspaces.cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirmCommit}>
            {confirm?.kind === "clear-workspace"
              ? t("workspaces.confirmClear")
              : t("workspaces.confirmDelete")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
